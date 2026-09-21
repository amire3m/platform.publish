// -----------------------------------------------------------------------------
// Instagram browser provider — Playwright automation for Reels (no Graph API).
// -----------------------------------------------------------------------------
// Reels-only for Phase 1. Anti-detection: real UA, locale/timezone Tehran,
// jittered human pauses. Every run is serialized via big-job and opened
// → posted → closed (no leaked contexts on a 2GB box). Screenshots on failure
// are surfaced via PublishResult.raw for the worker's publishResults history.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Provider, PublishInput, PublishResult } from "./types";

const REALISTIC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickFirst(locator: import("playwright").Locator): Promise<boolean> {
  const n = await locator.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const c = locator.nth(i);
    if (!((await c.isVisible().catch(() => false)) && !(await c.isDisabled().catch(() => false)))) continue;
    try {
      await c.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await c.click({ timeout: 5000 });
      return true;
    } catch {
      try { await c.click({ timeout: 5000, force: true }); return true; } catch {}
    }
  }
  return false;
}

async function ensureCreateInput(
  page: import("playwright").Page,
): Promise<import("playwright").Locator | null> {
  const input = page.locator('input[type="file"]').first();
  if ((await input.count()) > 0) return input;
  // Try to open the create flow.
  const candidates = [
    page.getByRole("link", { name: /Create|ایجاد/i }),
    page.getByRole("button", { name: /Create|ایجاد/i }),
    page.locator('a[href*="/create"]'),
  ];
  for (const c of candidates) {
    if (await clickFirst(c)) {
      await sleep(1200);
      if ((await input.count()) > 0) return input;
    }
  }
  // Some flows ask for format first (Post/Reel).
  const pickers = [
    page.getByText(/Reel/i, { exact: true }),
    page.getByRole("button", { name: /Reel/i }),
  ];
  for (const p of pickers) {
    if (await clickFirst(p)) {
      await sleep(1000);
      if ((await input.count()) > 0) return input;
    }
  }
  return null;
}

async function setVideoFile(page: import("playwright").Page, filePath: string): Promise<void> {
  let input = await ensureCreateInput(page);
  if (input && (await input.count()) > 0) {
    await input.waitFor({ state: "attached", timeout: 120000 });
    await input.setInputFiles(filePath);
    return;
  }
  // Fallback via filechooser event.
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10000 }).catch(() => null);
  const triggers = [
    page.getByRole("button", { name: /Select|Upload|انتخاب|آپلود/i }),
  ];
  for (const t of triggers) {
    if (await clickFirst(t)) break;
  }
  const chooser = await chooserPromise;
  if (chooser) {
    await chooser.setFiles(filePath);
    return;
  }
  input = page.locator('input[type="file"]').first();
  await input.waitFor({ state: "attached", timeout: 120000 });
  await input.setInputFiles(filePath);
}

function resolveVideoPath(input: PublishInput): string | null {
  if (input.filePath) return input.filePath;
  return null; // caller should have streamed large payloads to a temp file first
}

export async function instagramBrowserPublish(
  input: PublishInput,
  accountId: string,
): Promise<PublishResult> {
  const videoPath = resolveVideoPath(input);
  if (!videoPath) {
    return { ok: false, errorCode: "NO_FILE_PATH", message: "مسیر فایل ویدیو یافت نشد.", retryable: false };
  }
  try {
    await stat(videoPath);
  } catch {
    return { ok: false, errorCode: "FILE_NOT_FOUND", message: "فایل ویدیو در دیسک یافت نشد.", retryable: false };
  }

  const caption = [input.caption, ...(input.hashtags ?? [])].filter(Boolean).join("\n\n").slice(0, 2200);

  const { sessionPath } = await import("@/lib/instagram/session");
  const storageState = sessionPath(accountId);

  const { runBigJob } = await import("@/lib/media/big-job");

  return runBigJob(`ig-browser:${accountId}:${Date.now()}`, async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled", "--disable-infobars"],
    });
    let context: import("playwright").BrowserContext | null = null;
    try {
      context = await browser.newContext({
        storageState,
        viewport: { width: 1400, height: 1000 },
        userAgent: REALISTIC_UA,
        locale: "fa-IR",
        timezoneId: "Asia/Tehran",
      });
      const page = await context.newPage();

      // Warm the session — less suspicious than jumping straight to /create.
      await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(1500 + Math.random() * 2000);

      const loggedOut =
        /\/accounts\/login\/?/i.test(page.url()) ||
        (await page.locator('input[name="username"]').count()) > 0;
      if (loggedOut) {
        return { ok: false, errorCode: "SESSION_EXPIRED", message: "سشن مرورگر منقضی شده — دوباره storageState را آپلود کنید.", retryable: false };
      }

      await page.goto("https://www.instagram.com/create/style/", { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(1200);

      await setVideoFile(page, videoPath);
      await sleep(Math.max(5000, 5000));

      // Click through Next steps (crop → filters → details).
      for (let pass = 0; pass < 3; pass++) {
        const nextLocators = [
          page.getByRole("button", { name: /Next|بعدی/i }),
          page.locator("button").filter({ hasText: /Next|بعدی/i }),
        ];
        let clicked = false;
        for (const loc of nextLocators) {
          if (await clickFirst(loc)) { clicked = true; await sleep(1200); break; }
        }
        if (!clicked) break;
      }

      // Caption — type humanly.
      if (caption) {
        const candidates = ['textarea[aria-label*="caption" i]', 'textarea[placeholder*="caption" i]', 'textarea', 'div[contenteditable="true"]'];
        for (const sel of candidates) {
          const target = page.locator(sel).first();
          if ((await target.count()) === 0) continue;
          try {
            await target.click({ timeout: 8000 });
            await page.keyboard.press("Control+A");
            await page.keyboard.press("Delete");
            await target.type(caption, { delay: 10 });
            break;
          } catch {}
        }
      }

      const shareLocators = [
        page.getByRole("button", { name: /Share|اشتراک/i }),
        page.locator("button").filter({ hasText: /Share|اشتراک/i }),
      ];
      let shared = false;
      for (const loc of shareLocators) {
        if (await clickFirst(loc)) { shared = true; break; }
      }
      if (!shared) throw new Error("دکمه اشتراک‌گذاری یافت نشد.");

      const startedUrl = page.url();
      let ok = false;
      let lastText = "";
      for (let i = 0; i < 60; i++) {
        lastText = await page.locator("body").innerText().catch(() => "");
        if (/Your reel was shared|Reel shared|پست شد|shared/i.test(lastText)) { ok = true; break; }
        if (/error|خطا/i.test(lastText) && /couldn/i.test(lastText)) {
          return { ok: false, errorCode: "UPLOAD_ERROR", message: `اینستاگرام خطا داد: ${lastText.slice(0, 160)}`, retryable: true, raw: { lastText: lastText.slice(0, 400) } as Record<string, unknown> };
        }
        if (page.url() !== startedUrl && !/\/create\//i.test(page.url())) { ok = true; break; }
        await sleep(1500);
      }
      if (!ok) throw new Error("تأیید انتشار از اینستاگرام دریافت نشد.");

      // Success — best-effort screenshot for audit.
      let screenshotB64: string | null = null;
      try {
        const buf = await page.screenshot({ fullPage: true });
        screenshotB64 = buf.toString("base64").slice(0, 20000);
      } catch {}

      return {
        ok: true,
        externalId: `ig-browser-${Date.now()}`,
        permalink: `https://www.instagram.com/`,
        raw: { browser: true, screenshot: screenshotB64 } as Record<string, unknown>,
      } satisfies PublishResult;
    } catch (err) {
      const msg = (err as Error).message || "خطای نامشخص مرورگر";
      // Screenshot on failure for post-mortem.
      let shot: string | null = null;
      try {
        const pages = context?.pages() ?? [];
        if (pages[0]) shot = (await pages[0].screenshot({ fullPage: true })).toString("base64").slice(0, 20000);
      } catch {}
      return {
        ok: false,
        errorCode: "BROWSER_PUBLISH_FAILED",
        message: msg.slice(0, 280),
        retryable: /rate|429|timeout/i.test(msg),
        raw: { browser: true, screenshot: shot, error: msg.slice(0, 400) } as Record<string, unknown>,
      } satisfies PublishResult;
    } finally {
      await context?.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  });
}

export const instagramBrowserProvider = {
  name: "instagram-browser" as const,
  publish: async (input: PublishInput & { accountId?: string }): Promise<PublishResult> => {
    const accountId = (input as { accountId?: string }).accountId ?? (input.accountExternalId || "");
    return instagramBrowserPublish(input, accountId);
  },
};
