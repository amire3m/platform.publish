import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSnapshots, content } from "@/db/schema";

export interface HealthCard {
  label: string;
  value: string;
  delta: string | null;
  tone: "ok" | "warn" | "fail";
}

export interface HealthAlert {
  level: "warn" | "fail";
  message: string;
}

export interface RadarHealth {
  cards: HealthCard[];
  alerts: HealthAlert[];
  generatedAt: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function pctDelta(cur: number, prev: number): string | null {
  if (!prev) return cur ? "+∞%" : null;
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

export async function buildRadarHealth(): Promise<RadarHealth> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000);
  const d14 = new Date(now.getTime() - 14 * 86400000);
  const d28 = new Date(now.getTime() - 28 * 86400000);

  // Aggregate views/impressions from snapshots (account scope, last 7/14/28d)
  let rows: Array<{ dateUtc: Date; views: number | null; impressions: number | null; ctr: number | null }> = [];
  try {
    rows = (await db
      .select({ dateUtc: analyticsSnapshots.dateUtc, views: analyticsSnapshots.views, impressions: analyticsSnapshots.impressions, ctr: analyticsSnapshots.ctr })
      .from(analyticsSnapshots)
      .where(sql`${analyticsSnapshots.dateUtc} >= ${d28}`)) as never;
  } catch { rows = []; }

  const sum = (arr: typeof rows, field: "views" | "impressions") =>
    arr.reduce((a, r) => a + Number((r as Record<string, unknown>)[field] ?? 0), 0);
  const avgCtr = (arr: typeof rows) => {
    const vals = arr.map((r) => Number(r.ctr ?? 0)).filter((v) => Number.isFinite(v) && v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const last7 = rows.filter((r) => r.dateUtc >= d7);
  const prev7 = rows.filter((r) => r.dateUtc >= d14 && r.dateUtc < d7);
  const last28 = rows;

  const v7 = sum(last7, "views");
  const vPrev7 = sum(prev7, "views");
  const ctr7 = avgCtr(last7);
  const ctrPrev7 = avgCtr(prev7);

  // Publishing cadence from content table
  let recentContent: Array<{ createdAt: Date; status: string }> = [];
  try {
    recentContent = (await db
      .select({ createdAt: content.createdAt, status: content.status })
      .from(content)
      .where(sql`${content.createdAt} >= ${d28}`)) as never;
  } catch { recentContent = []; }
  const pub7 = recentContent.filter((r) => r.createdAt >= d7).length;
  const pubPrev7 = recentContent.filter((r) => r.createdAt >= d14 && r.createdAt < d7).length;
  const successRate = recentContent.length ? recentContent.filter((r) => r.status === "published").length / recentContent.length : 0;

  const cards: HealthCard[] = [
    { label: "بازدید ۷ روز", value: fmt(v7), delta: pctDelta(v7, vPrev7), tone: v7 >= vPrev7 ? "ok" : vPrev7 ? "warn" : "ok" },
    { label: "CTR میانگین ۷ روز", value: ctr7 ? `${ctr7.toFixed(2)}%` : "—", delta: ctr7 && ctrPrev7 ? pctDelta(ctr7, ctrPrev7) : null, tone: ctr7 >= ctrPrev7 ? "ok" : ctrPrev7 ? "warn" : "ok" },
    { label: "انتشار ۷ روز", value: String(pub7), delta: pctDelta(pub7, pubPrev7), tone: pub7 >= pubPrev7 || pubPrev7 === 0 ? "ok" : "warn" },
    { label: "نرخ موفقیت ۲۸ روز", value: `${Math.round(successRate * 100)}%`, delta: null, tone: successRate >= 0.85 ? "ok" : successRate >= 0.6 ? "warn" : "fail" },
  ];

  const alerts: HealthAlert[] = [];
  if (pub7 === 0) alerts.push({ level: "fail", message: "۷ روز بدون انتشار — الگوریتم افت می‌کند." });
  else if (pub7 < 2) alerts.push({ level: "warn", message: "فرکانس انتشار کم است (کمتر از ۲ در هفته)." });
  if (ctr7 && ctrPrev7 && ctr7 < ctrPrev7 * 0.8) alerts.push({ level: "warn", message: `افت CTR بیش از ۲۰٪ نسبت به هفته قبل (${ctrPrev7.toFixed(2)}% → ${ctr7.toFixed(2)}%).` });
  if (v7 < vPrev7 * 0.7 && vPrev7 > 0) alerts.push({ level: "warn", message: "افت بازدید بیش از ۳۰٪ نسبت به هفته قبل." });
  if (successRate < 0.6 && recentContent.length >= 5) alerts.push({ level: "fail", message: "نرخ موفقیت انتشار زیر ۶۰٪ — خطاهای worker را بررسی کنید." });

  return { cards, alerts, generatedAt: now.toISOString() };
}
