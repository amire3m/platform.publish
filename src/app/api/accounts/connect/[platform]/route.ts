// Connects a new YouTube channel or Instagram business account.
//
// mode="mock"  -> creates an account row immediately with connectionStatus
//                 "mock" so the whole content pipeline (upload, calendar,
//                 approval, worker) can be exercised end-to-end without a
//                 real Google/Meta app — the UI clearly marks it as a test
//                 account and the worker will never claim a real publish for it.
// mode="oauth" -> returns an authorization URL to redirect the browser to.
//                 Requires GOOGLE_CLIENT_ID/SECRET (YouTube) or
//                 META_APP_ID/SECRET (Instagram) to be configured; otherwise
//                 responds with a clear Persian "not configured" error
//                 instead of pretending to connect.
import { db } from "@/db";
import { socialAccounts, telegramTopics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { generateEntityId } from "@/lib/ids";
import { getGoogleOAuthClient, YOUTUBE_OAUTH_SCOPES } from "@/lib/providers/youtube";
import { DEFAULT_CAPABILITY_CONFIG } from "@/lib/capabilities";
import { socialAccountConnectSchema } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { platform } = await params;
  if (platform !== "youtube" && platform !== "instagram") return jsonError("پلتفرم نامعتبر است.", 400);

  const body = await req.json();
  const parsed = socialAccountConnectSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "داده ورودی نامعتبر است.", 422);

  if (parsed.data.mode === "oauth") {
    if (platform === "youtube") {
      if (!process.env.GOOGLE_CLIENT_ID) {
        return jsonError("اتصال یوتیوب پیکربندی نشده است (GOOGLE_CLIENT_ID تنظیم نشده). از حالت آزمایشی استفاده کنید.", 400);
      }
      const oauth2Client = getGoogleOAuthClient();
      const url = oauth2Client.generateAuthUrl({ access_type: "offline", scope: YOUTUBE_OAUTH_SCOPES, prompt: "consent" });
      return jsonOk({ authUrl: url });
    }
    if (!process.env.META_APP_ID) {
      return jsonError("اتصال اینستاگرام پیکربندی نشده است (META_APP_ID تنظیم نشده). از حالت آزمایشی استفاده کنید.", 400);
    }
    const redirectUri = process.env.META_REDIRECT_URI || "http://localhost:3000/api/accounts/callback/instagram";
    // Instagram API with Instagram Login (direct login, no Facebook Page needed).
    const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&response_type=code&scope=instagram_business_basic,instagram_business_content_publish`;
    return jsonOk({ authUrl });
  }

  // mock mode
  let topicId: string | null = null;
  let topicThreadId: number | null = null;
  let topicLabel: string | null = null;
  if (parsed.data.topicId) {
    const [topic] = await db.select().from(telegramTopics).where(eq(telegramTopics.id, parsed.data.topicId)).limit(1);
    if (topic) {
      topicId = topic.id;
      topicThreadId = topic.messageThreadId;
      topicLabel = topic.label;
    }
  }

  const [created] = await db
    .insert(socialAccounts)
    .values({
      id: generateEntityId("ACC"),
      platform,
      externalAccountId: `mock_${platform}_${Date.now()}`,
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      topicId,
      topicMessageThreadId: topicThreadId,
      topicLabel,
      connectionStatus: "mock",
      capabilities: DEFAULT_CAPABILITY_CONFIG[platform],
    })
    .returning();

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "account_connected_mock",
    entityType: "social_account",
    entityId: created.id,
    after: { platform, username: created.username },
  });

  return jsonOk(created, 201);
}
