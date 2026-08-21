// -----------------------------------------------------------------------------
// Instagram provider — official Instagram API (Instagram Login) only, for
// Business/Creator accounts. Uses the container -> publish flow documented at
// https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
// No web automation, no password login, ever.
// -----------------------------------------------------------------------------
import type { Provider, PublishInput, PublishResult } from "./types";

const GRAPH_VERSION = "v21.0";
const GRAPH_ROOT = `https://graph.instagram.com/${GRAPH_VERSION}`;

function isConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

interface IgCredential {
  accessToken: string;
  igUserId: string;
  expiresAt?: number;
}

/**
 * Refreshes a long-lived Instagram access token (adds another ~60 days).
 * Only works while the current token is still valid (not yet expired), so the
 * platform refreshes automatically before expiry to keep connections permanent.
 */
export async function refreshInstagramToken(
  currentToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(
      currentToken,
    )}`,
  );
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return { accessToken: json.access_token as string, expiresIn: Number(json.expires_in ?? 0) };
}

async function graphFetch(path: string, params: Record<string, string>, method: "GET" | "POST" = "GET") {
  const url = new URL(`${GRAPH_ROOT}${path}`);
  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    method,
    ...(method === "POST"
      ? { headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) }
      : {}),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `خطای Graph API (${res.status})`);
  }
  return json;
}

// Instagram requires a publicly reachable URL for media, it cannot accept raw
// binary bytes. Files live in Telegram; a signed temporary URL is passed in
// (see buildMediaProxyUrl in the worker). Raw bytes are never written to our
// own disk/storage, keeping Telegram as the only file store.
async function publish(input: PublishInput, telegramFileUrl: string): Promise<PublishResult> {
  if (!isConfigured() || !input.credentialPayload) {
    return {
      ok: false,
      errorCode: "NOT_CONFIGURED",
      message: "اتصال اینستاگرام پیکربندی نشده است. از حالت آزمایشی استفاده کنید یا اتصال اینستاگرام را در تنظیمات متصل کنید.",
      retryable: false,
    };
  }
  const cred = input.credentialPayload as unknown as IgCredential;
  try {
    const isVideo = input.contentType === "reel";
    const containerParams: Record<string, string> = {
      access_token: cred.accessToken,
      caption: [input.caption, ...(input.hashtags ?? [])].filter(Boolean).join("\n\n"),
    };
    if (isVideo) {
      containerParams.media_type = "REELS";
      containerParams.video_url = telegramFileUrl;
    } else {
      containerParams.image_url = telegramFileUrl;
    }
    const container = await graphFetch(`/${cred.igUserId}/media`, containerParams, "POST");
    const creationId = container.id as string;

    if (isVideo) {
      // Poll container status until FINISHED (required before publishing video containers).
      let status = "IN_PROGRESS";
      for (let i = 0; i < 20 && status === "IN_PROGRESS"; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await graphFetch(`/${creationId}`, {
          access_token: cred.accessToken,
          fields: "status_code",
        });
        status = statusRes.status_code;
      }
      if (status !== "FINISHED") {
        return {
          ok: false,
          errorCode: "CONTAINER_NOT_READY",
          message: "پردازش ویدیو در اینستاگرام کامل نشد.",
          retryable: true,
        };
      }
    }

    const publishRes = await graphFetch(
      `/${cred.igUserId}/media_publish`,
      { access_token: cred.accessToken, creation_id: creationId },
      "POST",
    );
    const mediaId = publishRes.id as string;
    const permalinkRes = await graphFetch(`/${mediaId}`, { access_token: cred.accessToken, fields: "permalink" });

    return { ok: true, externalId: mediaId, permalink: permalinkRes.permalink, raw: publishRes };
  } catch (err) {
    const message = (err as Error).message || "خطای ناشناخته در انتشار اینستاگرام";
    const retryable = /rate|limit|5\d\d/i.test(message);
    return { ok: false, errorCode: "INSTAGRAM_API_ERROR", message, retryable };
  }
}

export const instagramProvider: Provider & { publishWithUrl: typeof publish } = {
  name: "instagram",
  isConfigured,
  publish: async (input: PublishInput) => {
    return {
      ok: false,
      errorCode: "URL_REQUIRED",
      message: "انتشار اینستاگرام نیازمند URL موقت فایل است؛ از publishWithUrl استفاده کنید.",
      retryable: false,
    };
  },
  publishWithUrl: publish,
};
