import { promises as fs } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { encryptSecret } from "@/lib/crypto";
import { normalizeCookieContent } from "@/lib/live/shared";

export const runtime = "nodejs";

/** Server-side plaintext path (chmod 600) — set via LIVE_YTDLP_COOKIES in .env. */
function cookiesPath(): string | null {
  return process.env.LIVE_YTDLP_COOKIES?.trim() || null;
}

export async function GET() {
  const { response } = await requirePermission("manage_live");
  if (response) return response;
  try {
    const [row] = await db.select().from(credentials).where(eq(credentials.provider, "youtube_cookies")).limit(1);
    let fileOk = false;
    const p = cookiesPath();
    if (p) fileOk = await fs.readFile(p).then(() => true).catch(() => false);
    return jsonOk({ configured: !!row, fileOk: !!p && fileOk });
  } catch (err) {
    return jsonInternalError(err, "live/cookies GET");
  }
}

export async function POST(req: Request) {
  const { response } = await requirePermission("manage_live");
  if (response) return response;
  try {
    const body = (await req.json().catch(() => null)) as { content?: string } | null;
    const content = normalizeCookieContent(body?.content ?? "");
    if (!content) {
      return jsonError("محتوا شبیه cookies.txt (Netscape) یا خروجی JSON کوکی نیست.", 422, "VALIDATION_ERROR");
    }
    const p = cookiesPath();
    if (!p) return jsonError("مسیر ذخیره کوکی روی سرور تنظیم نشده است (LIVE_YTDLP_COOKIES).", 500, "NOT_CONFIGURED");
    await fs.mkdir(p.substring(0, p.lastIndexOf("/")), { recursive: true });
    await fs.writeFile(p, content + "\n", { mode: 0o600 });
    // Encrypted mirror in the credential vault for audit/restore.
    await db
      .insert(credentials)
      .values({ id: `CRD-cookies-${Date.now()}`, provider: "youtube_cookies", label: "yt-dlp cookies", encryptedPayload: encryptSecret(content) });
    return jsonOk({ configured: true, fileOk: true });
  } catch (err) {
    return jsonInternalError(err, "live/cookies POST");
  }
}

export async function DELETE() {
  const { response } = await requirePermission("manage_live");
  if (response) return response;
  try {
    const p = cookiesPath();
    if (p) await fs.rm(p, { force: true });
    await db.delete(credentials).where(eq(credentials.provider, "youtube_cookies"));
    return jsonOk({ configured: false, fileOk: false });
  } catch (err) {
    return jsonInternalError(err, "live/cookies DELETE");
  }
}
