// Short-lived, signed proxy that streams a file's bytes from Telegram to an
// external publish API (e.g. Instagram Graph API needs a fetchable URL). The
// token is a 15-minute JWT carrying only the Telegram `file_id` — the bot
// token itself is never exposed in the URL, and nothing is written to disk.
import jwt from "jsonwebtoken";
import { TelegramClient } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

interface TelegramMediaTokenPayload {
  fileId: string;
  contentType?: string;
}

export interface TelegramMediaRouteDependencies {
  verifyToken: (token: string) => TelegramMediaTokenPayload;
  createClient: () => Pick<TelegramClient, "downloadFileResponse">;
}

const FORWARDED_HEADERS = ["content-length", "content-range", "accept-ranges", "etag", "last-modified"];

export async function handleTelegramMediaRequest(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
  deps: TelegramMediaRouteDependencies,
) {
  const { token } = await params;
  let payload: TelegramMediaTokenPayload;
  try {
    payload = deps.verifyToken(token);
  } catch {
    return new Response("لینک منقضی یا نامعتبر است.", { status: 403 });
  }

  try {
    if (payload.fileId.startsWith("bundle:")) {
      return await serveBundle(req, payload);
    }
    const upstream = await deps.createClient().downloadFileResponse(payload.fileId, req.headers.get("range"));
    const headers = new Headers({
      "content-type": payload.contentType || upstream.headers.get("content-type") || "application/octet-stream",
      "cache-control": "private, no-store",
      "content-disposition": "inline",
    });
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    return new Response(`دریافت فایل از تلگرام ناموفق بود: ${(err as Error).message}`, { status: 502 });
  }
}

/** Multipart bundles reassemble on the fly (streamed from disk, range-aware). */
async function serveBundle(req: Request, payload: TelegramMediaTokenPayload): Promise<Response> {
  try {
    const { bundleIdOf, materializeBundle } = await import("@/lib/media/bundles");
    const { TelegramClient } = await import("@/lib/telegram/client");
    const client = TelegramClient.fromEnv();
    const mat = await materializeBundle(bundleIdOf(payload.fileId), async (ref) => {
      const dl = await client.downloadToTempFile(ref);
      return { path: dl.path, cleanup: dl.cleanup };
    });
    // Best-effort delayed cleanup (32min, past the token's 15min life)
    setTimeout(() => mat.cleanup().catch(() => {}), 32 * 60 * 1000).unref?.();
    const fs = await import("node:fs");
    const range = req.headers.get("range");
    const headers = new Headers({
      "content-type": payload.contentType || "application/octet-stream",
      "cache-control": "private, no-store",
      "content-disposition": "inline",
      "accept-ranges": "bytes",
    });
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      const start = m?.[1] ? Number(m[1]) : 0;
      const end = m?.[2] ? Number(m[2]) : mat.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= mat.size) {
        await mat.cleanup().catch(() => {});
        return new Response("بازه نامعتبر است.", { status: 416 });
      }
      const clampedEnd = Math.min(end, mat.size - 1);
      headers.set("content-range", `bytes ${start}-${clampedEnd}/${mat.size}`);
      headers.set("content-length", String(clampedEnd - start + 1));
      const stream = fs.createReadStream(mat.path, { start, end: clampedEnd });
      return new Response(stream as unknown as BodyInit, { status: 206, headers });
    }
    headers.set("content-length", String(mat.size));
    return new Response(fs.createReadStream(mat.path) as unknown as BodyInit, { status: 200, headers });
  } catch (err) {
    return new Response(`سرهم‌بندی باندل ناموفق بود: ${(err as Error).message}`, { status: 502 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  return handleTelegramMediaRequest(req, ctx, {
    verifyToken: (token) => jwt.verify(token, secret) as TelegramMediaTokenPayload,
    createClient: () => TelegramClient.fromEnv(),
  });
}
