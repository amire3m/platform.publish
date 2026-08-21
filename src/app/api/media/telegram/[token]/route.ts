// Short-lived, signed proxy that streams a file's bytes from Telegram to an
// external publish API (e.g. Instagram Graph API needs a fetchable URL). The
// token is a 15-minute JWT carrying only the Telegram `file_id` — the bot
// token itself is never exposed in the URL, and nothing is written to disk.
import jwt from "jsonwebtoken";
import { TelegramClient } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  let payload: { fileId: string };
  try {
    payload = jwt.verify(token, secret) as { fileId: string };
  } catch {
    return new Response("لینک منقضی یا نامعتبر است.", { status: 403 });
  }

  try {
    const client = TelegramClient.fromEnv();
    const buffer = await client.downloadFile(payload.fileId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(`دریافت فایل از تلگرام ناموفق بود: ${(err as Error).message}`, { status: 502 });
  }
}
