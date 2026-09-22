// Business Suite per-account sessions — each IG Page has its own Business login via business.facebook.com
import { mkdir, stat, unlink, writeFile, chmod, readFile } from "node:fs/promises";
import { join } from "node:path";

function suiteRoot(): string {
  if (process.env.BUSINESS_SUITE_SESSION_ROOT) return process.env.BUSINESS_SUITE_SESSION_ROOT;
  if (process.env.NODE_ENV === "production") return "/opt/emro/.secrets/business-suite";
  return join(process.cwd(), ".data", "business-suite");
}

export function suiteSessionPath(accountId: string): string {
  return join(suiteRoot(), accountId, "storageState.json");
}

export const SUITE_DEVICE = {
  // Business Suite is a desktop tool — use desktop fingerprint (mobile breaks its login form)
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1366, height: 768 },
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
} as const;

export async function hasSuiteSession(accountId: string): Promise<boolean> {
  try { const st = await stat(suiteSessionPath(accountId)); return st.isFile() && st.size > 100; } catch { return false; }
}

export async function saveSuiteSession(accountId: string, raw: string): Promise<void> {
  const text = raw.trim();
  if (text.length < 10) throw new Error("فایل سشن خالی است.");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("JSON نامعتبر است."); }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.cookies) || !Array.isArray(obj.origins)) throw new Error("فرمت storageState نامعتبر است.");
  const dir = join(suiteRoot(), accountId);
  await mkdir(dir, { recursive: true });
  const p = suiteSessionPath(accountId);
  await writeFile(p, JSON.stringify(parsed, null, 2), "utf-8");
  try { await chmod(p, 0o600); } catch {}
}

export async function saveSuiteFromCookies(accountId: string, cookies: { c_user: string; xs?: string; fr?: string }): Promise<void> {
  const cu = cookies.c_user?.trim();
  if (!cu) throw new Error("c_user الزامی است.");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 86400;
  const list: Record<string, unknown>[] = [
    { name: "c_user", value: cu, domain: ".facebook.com", path: "/", expires: exp, httpOnly: false, secure: true, sameSite: "None" },
  ];
  if (cookies.xs?.trim()) list.push({ name: "xs", value: cookies.xs!.trim(), domain: ".facebook.com", path: "/", expires: exp, httpOnly: true, secure: true, sameSite: "None" });
  if (cookies.fr?.trim()) list.push({ name: "fr", value: cookies.fr!.trim(), domain: ".facebook.com", path: "/", expires: exp, httpOnly: false, secure: true, sameSite: "None" });
  // Also set for business.facebook.com
  const list2 = list.map((c) => ({ ...c, domain: ".business.facebook.com" }));
  await saveSuiteSession(accountId, JSON.stringify({ cookies: [...list, ...list2], origins: [] }));
}

export async function loginViaBusinessSuite(accountId: string, email: string, password: string, code?: string): Promise<{ ok: boolean; needCode?: boolean; detail: string }> {
  const e = email.trim();
  const p = password;
  if (!e || !p) throw new Error("ایمیل و رمز عبور الزامی است.");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ctx = await browser.newContext({
    viewport: SUITE_DEVICE.viewport,
    userAgent: SUITE_DEVICE.userAgent,
    locale: SUITE_DEVICE.locale,
    timezoneId: SUITE_DEVICE.timezoneId,
    isMobile: SUITE_DEVICE.isMobile,
    hasTouch: SUITE_DEVICE.hasTouch,
    deviceScaleFactor: SUITE_DEVICE.deviceScaleFactor,
  });
  const page = await ctx.newPage();
  try {
    await page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    // Facebook redirects business.facebook.com to its login — handle both directly and via business
    if (/business\.facebook\.com/i.test(page.url()) && (await page.locator('input[name="email"]').count()) === 0) {
      await page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1500);
    }
    const emailInput = page.locator('input[name="email"], #email, input[data-testid="royal_email"]').first();
    const hasLogin = (await emailInput.count()) > 0 && (await emailInput.isVisible().catch(() => false));
    if (hasLogin) {
      await emailInput.click({ timeout: 5000 }).catch(() => {});
      await emailInput.fill(e, { timeout: 10000 });
      const passInput = page.locator('input[name="pass"], input[type="password"], #pass').first();
      await passInput.click({ timeout: 5000 }).catch(() => {});
      await passInput.fill(p, { timeout: 10000 });
      const loginBtn = page.locator('button[name="login"], button[data-testid="royal_login_button"], button[type="submit"]').first();
      await loginBtn.click({ timeout: 8000 }).catch(async () => {
        await page.getByRole("button", { name: /Log in|ورود/i }).first().click({ timeout: 5000 }).catch(() => {});
      });
      await page.waitForTimeout(5000);
      // Handle "Save Browser" / "Not Now" interstitial that blocks 2FA
      await page.getByRole("button", { name: /Not Now|بعداً|Not now/i }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const codeInput = page.locator('input[name="approvals_code"], input[id="approvals_code"], input[placeholder*="code" i], input[aria-label*="code" i], input[inputmode="numeric"]').first();
      const hasCodePrompt = (await codeInput.count()) > 0 && (await codeInput.isVisible().catch(() => false));
      if (hasCodePrompt) {
        if (!code?.trim()) { await browser.close(); return { ok: false, needCode: true, detail: "کد تأیید ۲ مرحله‌ای را وارد کنید." }; }
        await codeInput.fill(code.trim());
        await page.getByRole("button", { name: /Continue|تأیید|Continue/i }).first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(4000);
      }
      const errText = await page.locator('[role="alert"], div[data-testid="error"], #error_box').first().innerText().catch(() => "");
      if (errText && /incorrect|اشتباه|wrong|incorrect password|نادرست/i.test(errText)) throw new Error(errText.slice(0, 200));
      await page.waitForTimeout(2500);
      // Verify we actually landed on facebook/business
      const url = page.url();
      const body = await page.locator("body").innerText().catch(() => "");
      const stillLogin = /\/login|checkpoint/i.test(url) || (await page.locator('input[name="email"], #email').count()) > 0;
      if (stillLogin && !/business\.facebook\.com/i.test(url)) {
        if (/challenge|verify|تأیید|two-factor|approvals_code/i.test(body + url)) return { ok: false, needCode: true, detail: "کد تأیید لازم است — کد ۶ رقمی را وارد کنید." };
        const snippet = body.slice(0, 300).replace(/\s+/g, " ");
        throw new Error(`ورود ناموفق — ${snippet || "ایمیل/رمز را بررسی کنید."}`.slice(0, 280));
      }
      // Final check: can we reach Business Suite?
      await page.goto("https://business.facebook.com/", { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(2000);
      if (/\/login/i.test(page.url())) {
        const b2 = await page.locator("body").innerText().catch(() => "");
        if (/challenge|verify/i.test(b2)) return { ok: false, needCode: true, detail: "کد تأیید لازم است." };
      }
    }
    const dir = join(suiteRoot(), accountId);
    await mkdir(dir, { recursive: true });
    await ctx.storageState({ path: suiteSessionPath(accountId) });
    try { await chmod(suiteSessionPath(accountId), 0o600); } catch {}
    return { ok: true, detail: "ورود موفق — سشن Business Suite ذخیره شد." };
  } finally { await browser.close().catch(() => {}); }
}

export async function removeSuiteSession(accountId: string): Promise<void> {
  try { await unlink(suiteSessionPath(accountId)); } catch {}
}

export async function verifySuiteSession(accountId: string): Promise<{ ok: boolean; detail: string }> {
  const p = suiteSessionPath(accountId);
  try { await stat(p); } catch { return { ok: false, detail: "سشنی ذخیره نشده است." }; }
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const ctx = await browser.newContext({
      storageState: p,
      viewport: SUITE_DEVICE.viewport,
      userAgent: SUITE_DEVICE.userAgent,
      locale: SUITE_DEVICE.locale,
      timezoneId: SUITE_DEVICE.timezoneId,
      isMobile: SUITE_DEVICE.isMobile,
      hasTouch: SUITE_DEVICE.hasTouch,
      deviceScaleFactor: SUITE_DEVICE.deviceScaleFactor,
    });
    const page = await ctx.newPage();
    await page.goto("https://business.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    const url = page.url();
    const loggedOut = /\/login/i.test(url) || (await page.locator('input[name="email"]').count()) > 0;
    if (!loggedOut) { try { await ctx.storageState({ path: p }); await chmod(p, 0o600); } catch {} }
    await browser.close();
    return loggedOut ? { ok: false, detail: "سشن منقضی شده." } : { ok: true, detail: "سشن معتبر است." };
  } catch (err) { return { ok: false, detail: `اعتبارسنجی ناموفق: ${(err as Error).message.slice(0, 120)}` }; }
}

export async function touchSuiteSession(accountId: string): Promise<{ ok: boolean; detail: string }> {
  const p = suiteSessionPath(accountId);
  try { await stat(p); } catch { return { ok: false, detail: "سشنی ذخیره نشده است." }; }
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const ctx = await browser.newContext({
      storageState: p,
      viewport: SUITE_DEVICE.viewport,
      userAgent: SUITE_DEVICE.userAgent,
      locale: SUITE_DEVICE.locale,
      timezoneId: SUITE_DEVICE.timezoneId,
      isMobile: SUITE_DEVICE.isMobile,
      hasTouch: SUITE_DEVICE.hasTouch,
      deviceScaleFactor: SUITE_DEVICE.deviceScaleFactor,
    });
    const page = await ctx.newPage();
    await page.goto("https://business.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    const loggedOut = /\/login/i.test(page.url()) || (await page.locator('input[name="email"]').count()) > 0;
    if (loggedOut) { await browser.close(); return { ok: false, detail: "سشن منقضی شده." }; }
    await page.mouse.wheel(0, 300).catch(() => {});
    await page.waitForTimeout(1500);
    await ctx.storageState({ path: p });
    try { await chmod(p, 0o600); } catch {}
    await browser.close();
    return { ok: true, detail: "سشن تازه شد." };
  } catch (err) { return { ok: false, detail: `به‌روزرسانی ناموفق: ${(err as Error).message.slice(0, 120)}` }; }
}
