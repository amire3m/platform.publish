// -----------------------------------------------------------------------------
// YouTube provider — YouTube Data API v3 (googleapis) resumable upload.
// -----------------------------------------------------------------------------
// Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI env
// vars and a per-account OAuth token stored (encrypted) in `credentials`.
// If not configured, callers should fall back to the mock provider — this
// module never fabricates a successful upload.
import { google } from "googleapis";
import { Readable } from "node:stream";
import type { Provider, PublishInput, PublishResult } from "./types";

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/accounts/callback/youtube",
  );
}

export const YOUTUBE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

async function publish(input: PublishInput): Promise<PublishResult> {
  if (!isConfigured() || !input.credentialPayload) {
    return {
      ok: false,
      errorCode: "NOT_CONFIGURED",
      message: "اتصال یوتیوب پیکربندی نشده است. از حالت آزمایشی استفاده کنید یا OAuth را در تنظیمات متصل کنید.",
      retryable: false,
    };
  }
  try {
    const oauth2Client = getGoogleOAuthClient();
    oauth2Client.setCredentials(input.credentialPayload);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const privacyStatus = input.privacyStatus || "private";
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: input.title?.slice(0, 100) || "بدون عنوان",
          description: input.description?.slice(0, 5000) || "",
          tags: input.tags,
          categoryId: input.category || "22",
        },
        status: {
          privacyStatus: privacyStatus as "private" | "public" | "unlisted",
          selfDeclaredMadeForKids: input.madeForKids ?? false,
          publishAt: input.publishAtUtc && privacyStatus === "private" ? input.publishAtUtc : undefined,
        },
      },
      media: {
        body: Readable.from(input.fileBuffer),
      },
    });

    const videoId = res.data.id;
    if (!videoId) {
      return { ok: false, errorCode: "NO_VIDEO_ID", message: "یوتیوب شناسه ویدیو را بازنگرداند.", retryable: true };
    }

    if (input.thumbnailBuffer) {
      try {
        await youtube.thumbnails.set({ videoId, media: { body: Readable.from(input.thumbnailBuffer) } });
      } catch {
        // Thumbnail failure should not fail the whole publish.
      }
    }

    return {
      ok: true,
      externalId: videoId,
      permalink: `https://youtu.be/${videoId}`,
      raw: { status: res.data.status, snippet: res.data.snippet },
    };
  } catch (err) {
    const rawMessage = (err as { message?: string })?.message ?? "خطای ناشناخته در انتشار یوتیوب";
    const retryable = /rate|quota|5\d\d/i.test(rawMessage);
    console.error("[youtube-provider] publish failed:", err);
    return { ok: false, errorCode: "YOUTUBE_API_ERROR", message: "انتشار در YouTube انجام نشد. دوباره تلاش کنید.", retryable };
  }
}

export const youtubeProvider: Provider = {
  name: "youtube",
  isConfigured,
  publish,
};
