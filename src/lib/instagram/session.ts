// -----------------------------------------------------------------------------
// Instagram browser sessions — on-disk storageState.json per account.
// -----------------------------------------------------------------------------
import { mkdir, stat, unlink, writeFile, chmod } from "node:fs/promises";
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

export async function saveBrowserSessionFromCookies(
  accountId: string,
  cookies: { sessionid: string; csrftoken?: string; ds_user_id?: string; mid?: string; rur?: string },
): Promise<void> {
  const sid = cookies.sessionid?.trim();
  if (!sid) throw new Error("sessionid الزامی است.");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 86400;
  const list: Record<string, unknown>[] = [
    { name: "sessionid", value: sid, domain: ".instagram.com", path: "/", expires: exp, httpOnly: true, secure: true, sameSite: "None" },
  ];
  if (cookies.csrftoken?.trim()) list.push({ name: "csrftoken", value: cookies.csrftoken.trim(), domain: ".instagram.com", path: "/", expires: exp, httpOnly: false, secure: true, sameSite: "Lax" });
  if (cookies.ds_user_id?.trim()) list.push({ name: "ds_user_id", value: cookies.ds_user_id.trim(), domain: ".instagram.com", path: "/", expires: exp, httpOnly: false, secure: true, sameSite: "Lax" });
  if (cookies.mid?.trim()) list.push({ name: "mid", value: cookies.mid.trim(), domain: ".instagram.com", path: "/", expires: exp, httpOnly: false, secure: true, sameSite: "Lax" });
  if (cookies.rur?.trim()) list.push({ name: "rur", value: cookies.rur.trim(), domain: ".instagram.com", path: "/", expires: exp, httpOnly: false, secure: true, sameSite: "Lax" });
  await saveBrowserSession(accountId, JSON.stringify({ cookies: list, origins: [] }));
}

export async function loginWithCredentials(
  accountId: string,
  username: string,
  password: string,
  code?: string,
): Promise<{ ok: boolean; needCode?: boolean; detail: string }> {
  const u = username.trim();
  const p = password;
  if (!u || !p) throw new Error("نام کاربری و رمز عبور الزامی است.");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });
  const page = await ctx.newPage();
  try {
    await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    const userInput = page.locator('input[name="username"]').first();
    await userInput.waitFor({ state: "visible", timeout: 15000 });
    await userInput.fill(u);
    await page.locator('input[name="password"]').first().fill(p);
    await page.getByRole("button", { name: /Log in|ورود/i }).first().click({ timeout: 5000 }).catch(async () => {
      await page.locator('button[type="submit"]').first().click({ timeout: 5000 }).catch(() => {});
    });
    await page.waitForTimeout(4000);

    // Check for 2FA / challenge
    const codeInput = page.locator('input[name="verificationCode"], input[aria-label*="Security code" i], input[placeholder*="Security code" i]').first();
    const hasCodePrompt = (await codeInput.count()) > 0 && (await codeInput.isVisible().catch(() => false));
    if (hasCodePrompt) {
      if (!code?.trim()) {
        await browser.close();
        return { ok: false, needCode: true, detail: "کد تأیید ۶رقمی اینستاگرام را وارد کنید." };
      }
      await codeInput.fill(code.trim());
      await page.getByRole("button", { name: /Confirm|تأیید|Next|بعدی/i }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(4000);
    }

    // Check for error banner
    const errText = await page.locator('[role="alert"], #slfErrorAlert').first().innerText().catch(() => "");
    if (errText && /incorrect|اشتباه|wrong|try again/i.test(errText)) {
      throw new Error(errText.slice(0, 160));
    }

    // Success if we left the login page
    await page.waitForTimeout(2000);
    const url = page.url();
    const stillLogin = /\/accounts\/login\/?/i.test(url) || (await page.locator('input[name="username"]').count()) > 0;
    if (stillLogin) {
      const body = await page.locator("body").innerText().catch(() => "");
      if (/challenge|تأیید|verify/i.test(body)) {
        return { ok: false, needCode: true, detail: "اینستاگرام کد تأیید می‌خواهد — کد ۶رقمی را وارد کنید." };
      }
      throw new Error("ورود ناموفق بود — نام کاربری/رمز را بررسی کنید.");
    }

    // Persist storageState
    const dir = join(sessionRoot(), accountId);
    await mkdir(dir, { recursive: true });
    await ctx.storageState({ path: sessionPath(accountId) });
    try { await chmod(sessionPath(accountId), 0o600); } catch {}
    return { ok: true, detail: "ورود موفق — سشن ذخیره شد." };
  } finally {
    await browser.close().catch(() => {});
  }
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
      ? { ok: false, detail: "سشن منقضی شده — دوباره وارد شوید یا فایل را آپلود کنید." }
      : { ok: true, detail: "سشن معتبر است." };
  } catch (err) {
    return { ok: false, detail: `اعتبارسنجی ناموفق بود: ${(err as Error).message.slice(0, 120)}` };
  }
}
