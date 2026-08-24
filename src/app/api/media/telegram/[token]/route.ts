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

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  return handleTelegramMediaRequest(req, ctx, {
    verifyToken: (token) => jwt.verify(token, secret) as TelegramMediaTokenPayload,
    createClient: () => TelegramClient.fromEnv(),
  });
}
