// Connects a new YouTube channel or Instagram business account.
//
// mode="oauth" -> returns an authorization URL to redirect the browser to.
//                 Requires GOOGLE_CLIENT_ID/SECRET (YouTube) or
//                 META_APP_ID/SECRET (Instagram) to be configured; otherwise
//                 responds with a clear Persian "not configured" error
//                 instead of pretending to connect.
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { getGoogleOAuthClient, YOUTUBE_OAUTH_SCOPES } from "@/lib/providers/youtube";
import { socialAccountConnectSchema } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { platform } = await params;
  if (platform !== "youtube" && platform !== "instagram") return jsonError("پلتفرم نامعتبر است.", 400);

  const body = await req.json();
  const parsed = socialAccountConnectSchema.safeParse(body);
  if (!parsed.success) return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");

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
