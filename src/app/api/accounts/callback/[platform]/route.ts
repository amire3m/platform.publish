// OAuth callback handlers. On success, tokens are encrypted and stored in the
// `credentials` table (never in Telegram, never sent to the browser) and the
// social account's connectionStatus becomes "connected".
import { NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts, credentials } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { generateEntityId } from "@/lib/ids";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { DEFAULT_CAPABILITY_CONFIG } from "@/lib/capabilities";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const user = await getCurrentUser();
  if (!user) return redirectTo("/login", req.url);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return redirectTo("/accounts?error=missing_code", req.url);

  let oauthPhase = "callback";
  try {
    if (platform === "youtube") {
      const oauth2Client = getGoogleOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      const { google } = await import("googleapis");
      const youtube = google.youtube({ version: "v3", auth: oauth2Client });
      const channelsRes = await youtube.channels.list({ part: ["snippet"], mine: true });
      const channel = channelsRes.data.items?.[0];

      const credId = generateEntityId("CRD");
      await db.insert(credentials).values({
        id: credId,
        provider: "youtube",
        label: channel?.snippet?.title ?? "کانال یوتیوب",
        encryptedPayload: encryptSecret(JSON.stringify(tokens)),
      });

      await db.insert(socialAccounts).values({
        id: generateEntityId("ACC"),
        platform: "youtube",
        externalAccountId: channel?.id ?? "",
        username: channel?.snippet?.title ?? "کانال یوتیوب",
        displayName: channel?.snippet?.title ?? "کانال یوتیوب",
        profileImage: channel?.snippet?.thumbnails?.default?.url ?? null,
        credentialRef: credId,
        connectionStatus: "connected",
        capabilities: DEFAULT_CAPABILITY_CONFIG.youtube,
      });

      await appendAuditEvent({
        actorTelegramId: user.telegramId,
        actorUserId: user.id,
        action: "account_connected_oauth",
        entityType: "social_account",
        after: { platform: "youtube", channelId: channel?.id },
      });

      return redirectTo("/accounts?connected=youtube", req.url);
    }

    if (platform === "instagram") {
      const redirectUri = process.env.META_REDIRECT_URI || "http://localhost:3000/api/accounts/callback/instagram";

      // 1) exchange auth code for a short-lived access token + ig user id
      oauthPhase = "instagram_code_exchange";
      const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      });
      const tokenJson = await tokenRes.json();
      if (tokenJson.error_description || tokenJson.error) {
        const message = tokenJson.error_description || tokenJson.error?.message || String(tokenJson.error);
        throw new Error(`HTTP ${tokenRes.status}: ${message}`);
      }
      const shortToken = tokenJson.access_token as string;
      const igUserId = String(tokenJson.user_id);

      // 2) exchange short-lived for a long-lived token (60 days)
      oauthPhase = "instagram_long_token_exchange";
      const longRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.META_APP_SECRET}&access_token=${shortToken}`,
      );
      const longJson = await longRes.json();
      if (longJson.error) {
        throw new Error(`HTTP ${longRes.status}: ${longJson.error.message} (code ${longJson.error.code ?? "unknown"})`);
      }
      const accessToken = (longJson.access_token as string) ?? shortToken;
      const expiresAt = longJson.expires_in ? Date.now() + Number(longJson.expires_in) * 1000 : Date.now() + 60 * 24 * 60 * 60 * 1000;

      // 3) fetch profile info
      oauthPhase = "instagram_profile_fetch";
      const profRes = await fetch(
        `https://graph.instagram.com/${igUserId}?fields=username,name,profile_picture_url&access_token=${accessToken}`,
      );
      const prof = await profRes.json();
      if (prof.error) {
        throw new Error(`HTTP ${profRes.status}: ${prof.error.message} (code ${prof.error.code ?? "unknown"})`);
      }
      const displayName = prof.name || prof.username || "حساب اینستاگرام";
      const username = prof.username || displayName;

      const credId = generateEntityId("CRD");
      await db.insert(credentials).values({
        id: credId,
        provider: "instagram",
        label: displayName,
        encryptedPayload: encryptSecret(JSON.stringify({ accessToken, igUserId, expiresAt })),
      });

      await db.insert(socialAccounts).values({
        id: generateEntityId("ACC"),
        platform: "instagram",
        externalAccountId: igUserId,
        username,
        displayName,
        profileImage: prof.profile_picture_url ?? null,
        credentialRef: credId,
        connectionStatus: "connected",
        capabilities: DEFAULT_CAPABILITY_CONFIG.instagram,
      });

      await appendAuditEvent({
        actorTelegramId: user.telegramId,
        actorUserId: user.id,
        action: "account_connected_oauth",
        entityType: "social_account",
        after: { platform: "instagram", igUserId, username },
      });

      return redirectTo("/accounts?connected=instagram", req.url);
    }

    return redirectTo("/accounts?error=unknown_platform", req.url);
  } catch (err) {
    const message = `${oauthPhase}: ${(err as Error).message}`;
    console.error("[oauth-callback] failed:", message);
    return redirectTo(`/accounts?error=${encodeURIComponent(message)}`, req.url);
  }
}

/**
 * Redirects to a path on the public base URL. Using `req.url` directly is
 * unreliable behind a reverse proxy (Next.js reconstructs it as
 * http://localhost:3000), so the configured APP_BASE_URL wins when set.
 */
function redirectTo(path: string, reqUrl: string): NextResponse {
  const base = process.env.APP_BASE_URL?.trim() || new URL(reqUrl).origin;
  return NextResponse.redirect(new URL(path, base));
}
