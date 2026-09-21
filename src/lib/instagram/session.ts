// -----------------------------------------------------------------------------
// Instagram browser sessions — on-disk storageState.json per account.
// -----------------------------------------------------------------------------
import { mkdir, readFile, stat, unlink, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";

function sessionRoot(): string {
  // Persistent outside the repo so deploys don't wipe sessions.
  if (process.env.INSTAGRAM_SESSION_ROOT) return process.env.INSTAGRAM_SESSION_ROOT;
  if (process.env.NODE_ENV === "production") return "/opt/emro/.secrets/instagram-sessions";
  return join(process.cwd(), ".data", "instagram-sessions");
}

export function sessionPath(accountId: string): string {
  return join(sessionRoot(), accountId, "storageState.json");
}

export async function hasBrowserSession(accountId: string): Promise<boolean> {
  try {
    const st = await stat(sessionPath(accountId));
    return st.isFile() && st.size > 100;
  } catch {
    return false;
  }
}

export async function saveBrowserSession(accountId: string, raw: string): Promise<void> {
  const text = raw.trim();
  if (text.length < 10) throw new Error("فایل سشن خالی است.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON نامعتبر است — فایل storageState.json مرورگر را آپلود کنید.");
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.cookies) || !Array.isArray(obj.origins)) {
    throw new Error("فرمت storageState نامعتبر است.");
  }
  const dir = join(sessionRoot(), accountId);
  await mkdir(dir, { recursive: true });
  const p = sessionPath(accountId);
  await writeFile(p, JSON.stringify(parsed, null, 2), "utf-8");
  try { await chmod(p, 0o600); } catch {}
}

export async function removeBrowserSession(accountId: string): Promise<void> {
  try { await unlink(sessionPath(accountId)); } catch {}
}

export async function verifyBrowserSession(accountId: string): Promise<{ ok: boolean; detail: string }> {
  const p = sessionPath(accountId);
  try { await stat(p); } catch { return { ok: false, detail: "سشنی ذخیره نشده است." }; }
  // Lightweight live check: open a headless page with this storageState and
  // see if instagram still considers us logged in (no password ever stored).
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const ctx = await browser.newContext({
      storageState: p,
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
    });
    const page = await ctx.newPage();
    const target = "https://www.instagram.com/";
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    const url = page.url();
    // Heuristic: if we are bounced to /accounts/login/, session is dead.
    const loggedOut = /\/accounts\/login\/?/i.test(url) || (await page.locator('input[name="username"]').count()) > 0;
    await browser.close();
    return loggedOut
      ? { ok: false, detail: "سشن منقضی شده — دوباره storageState را آپلود کنید." }
      : { ok: true, detail: "سشن معتبر است." };
  } catch (err) {
    return { ok: false, detail: `اعتبارسنجی ناموفق بود: ${(err as Error).message.slice(0, 120)}` };
  }
}
