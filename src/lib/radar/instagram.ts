import { INSTAGRAM_DEVICE } from "@/lib/instagram/session";

export interface ExternalVideo {
  externalId: string;
  title: string;
  channel: string;
  views: number | null;
  publishedAt: Date | null;
  thumbUrl: string | null;
  permalink: string;
}

export async function searchInstagramExplore(query: string, accountId?: string, limit = 10): Promise<ExternalVideo[]> {
  // Best-effort: use the first available browser session to scrape explore/search.
  // If no session, return empty (no scraping without auth).
  let sessionAccountId = accountId;
  if (!sessionAccountId) {
    try {
      const { db } = await import("@/db");
      const { socialAccounts } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await db.select().from(socialAccounts).where(eq(socialAccounts.platform, "instagram"));
      const withSession = (rows as unknown as Array<{ id: string; capabilities: Record<string, unknown> }>).find((r) => (r.capabilities as Record<string, unknown>)?.browserSession);
      sessionAccountId = withSession?.id;
    } catch {}
  }
  if (!sessionAccountId) return [];
  const { sessionPath } = await import("@/lib/instagram/session");
  const { chromium } = await import("playwright");
  const p = sessionPath(sessionAccountId);
  try {
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const ctx = await browser.newContext({
      storageState: p,
      viewport: INSTAGRAM_DEVICE.viewport,
      userAgent: INSTAGRAM_DEVICE.userAgent,
      locale: INSTAGRAM_DEVICE.locale,
      timezoneId: INSTAGRAM_DEVICE.timezoneId,
      isMobile: INSTAGRAM_DEVICE.isMobile,
      hasTouch: INSTAGRAM_DEVICE.hasTouch,
      deviceScaleFactor: INSTAGRAM_DEVICE.deviceScaleFactor,
    });
    const page = await ctx.newPage();
    const url = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);
    // Try hashtag fallback if explore empty
    let items: ExternalVideo[] = await scrapeGrid(page, query, "explore", limit);
    if (!items.length) {
      const tag = query.replace(/\s+/g, "").slice(0, 30);
      await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);
      items = await scrapeGrid(page, query, "hashtag", limit);
    }
    await browser.close();
    return items;
  } catch {
    return [];
  }
}

async function scrapeGrid(page: import("playwright").Page, query: string, source: string, limit: number): Promise<ExternalVideo[]> {
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 800).catch(() => {});
    await page.waitForTimeout(1500);
  }
  const links = await page.locator('a[href*="/p/"], a[href*="/reel/"]').all().catch(() => []);
  const out: ExternalVideo[] = [];
  for (const a of links.slice(0, limit)) {
    const href = await a.getAttribute("href").catch(() => null);
    if (!href) continue;
    const id = href.split("/").filter(Boolean).pop() ?? href;
    const permalink = href.startsWith("http") ? href : `https://www.instagram.com${href}`;
    const title = (await a.innerText().catch(() => "")).slice(0, 120) || query;
    const img = await a.locator("img").first().getAttribute("src").catch(() => null);
    out.push({ externalId: `${source}:${id}`, title, channel: "", views: null, publishedAt: null, thumbUrl: img, permalink });
  }
  return out;
}
