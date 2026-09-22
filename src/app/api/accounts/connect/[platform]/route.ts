// Connects a new YouTube channel or Instagram business account.
//
// mode="oauth" -> returns an authorization URL to redirect the browser to.
//                 Requires GOOGLE_CLIENT_ID/SECRET (YouTube) or
//                 META_APP_ID/SECRET (Instagram) to be configured; otherwise
//                 responds with a clear Persian "not configured" error
//                 instead of pretending to connect.
import { eq } from "drizzle-orm";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { getGoogleOAuthClient, YOUTUBE_OAUTH_SCOPES } from "@/lib/providers/youtube";
import { socialAccountConnectSchema } from "@/lib/validation";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";
import { DEFAULT_CAPABILITY_CONFIG } from "@/lib/capabilities";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

export async function POST(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { platform } = await params;
  if (platform !== "youtube" && platform !== "instagram") return jsonError("پلتفرم نامعتبر است.", 400);

  const body = await req.json();
  const parsed = socialAccountConnectSchema.safeParse(body);
  if (!parsed.success) return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");

  // Browser-only Instagram (no OAuth, no Facebook Page)
  if (platform === "instagram" && parsed.data.mode === "browser") {
    const username = parsed.data.username!.trim().replace(/^@/, "");
    const displayName = (parsed.data.displayName?.trim() || username) ?? username;
    const [existing] = await db.select().from(socialAccounts).where(eq(socialAccounts.username, username)).limit(1);
    if (existing) return jsonError("این نام کاربری قبلاً ثبت شده است.", 409);
    const id = generateEntityId("ACC");
    await db.insert(socialAccounts).values({
      id,
      platform: "instagram",
      externalAccountId: username,
      username,
      displayName,
      profileImage: null,
      credentialRef: null,
      connectionStatus: "connected",
      capabilities: { ...DEFAULT_CAPABILITY_CONFIG.instagram, browserSession: false, browserOnly: true },
    } as never);
    await appendAuditEvent({
      actorTelegramId: user.telegramId,
      actorUserId: user.id,
      action: "account_created_browser",
      entityType: "social_account",
      entityId: id,
      after: { platform: "instagram", username, displayName, mode: "browser" },
    } as never);
    return jsonOk({ created: true, id, username, displayName });
  }

  if (platform === "youtube") {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return jsonError("اتصال یوتیوب پیکربندی نشده است. اطلاعات اتصال را در تنظیمات سرور وارد کنید.", 400);
    }
    const oauth2Client = getGoogleOAuthClient();
    const url = oauth2Client.generateAuthUrl({ access_type: "offline", scope: YOUTUBE_OAUTH_SCOPES, prompt: "consent" });
    return jsonOk({ authUrl: url });
  }
  if (!process.env.META_APP_ID) {
    return jsonError("اتصال اینستاگرام پیکربندی نشده است. اطلاعات اتصال را در تنظیمات سرور وارد کنید.", 400);
  }
  const redirectUri = process.env.META_REDIRECT_URI || "http://localhost:3000/api/accounts/callback/instagram";
  // Instagram API with Instagram Login (direct login, no Facebook Page needed).
  const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&response_type=code&scope=instagram_business_basic,instagram_business_content_publish`;
  return jsonOk({ authUrl });
}
