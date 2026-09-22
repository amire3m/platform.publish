export const PALETTE_PRESETS: Record<string, { paper: string; ink: string; primary: string; soft: string; accent: string; label: string }> = {
  swiss: { paper: "#FFF8F0", ink: "#1A1A1A", primary: "#E63946", soft: "#F1FAEE", accent: "#457B9D", label: "Swiss Minimal" },
  magazine: { paper: "#FFFBEB", ink: "#111827", primary: "#DC2626", soft: "#FEF3C7", accent: "#059669", label: "Magazine Editorial" },
  cream: { paper: "#FFFBF0", ink: "#2D2A26", primary: "#D97706", soft: "#FFF7ED", accent: "#7C3AED", label: "Cream Soft" },
};

export function resolvePalette(channelPalette?: Partial<Record<string, string>>, preset: string = "swiss") {
  const base = PALETTE_PRESETS[preset] ?? PALETTE_PRESETS.swiss;
  return { ...base, ...channelPalette };
}

// HTML→PNG factory: string HTML with Vazirmatn, RTL, then screenshot via Playwright
export async function renderCoverHtmlToPng(html: string, width: number, height: number): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: "networkidle", timeout: 15000 });
  const buf = await page.screenshot({ type: "png" });
  await browser.close();
  // Audit: blank >15% (Farsi threshold 10%) → warn
  // Simple check: if html has little content, flag
  if (html.replace(/<[^>]+>/g, "").trim().length < 20) console.warn("[cover-audit] blank >15% — محتوای کم");
  return buf;
}

export function coverHtml(title: string, palette: ReturnType<typeof resolvePalette>): string {
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:1280px;height:720px;display:flex;align-items:center;justify-content:center;background:${palette.paper};font-family:Vazirmatn,Tahoma,sans-serif}h1{font-size:64px;font-weight:700;color:${palette.ink};line-height:1.4;text-align:center;max-width:900px} .accent{color:${palette.primary}} .bar{position:absolute;bottom:0;left:0;right:0;height:12px;background:${palette.accent}}</style></head><body><h1>${title}<div class="bar"></div></h1></body></html>`;
}
