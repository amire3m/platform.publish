// Content-strategy dossiers (نیچ‌های محتوایی یوتیوب) — authored with the
// institute, rendered read-only in /strategy. New topics are added as files
// under ./topics and registered in ./index.

export type CostTier = "سبک" | "متوسط" | "سنگین";

export interface StrategySeries {
  name: string;
  competition: number; // 1 (بکر) تا 5 (اشباع)
  potential: number; // 1 تا 5
  discourse: number; // ارزش گفتمانی 1 تا 5
  channels: string[]; // شناسه کانال‌ها
  note?: string;
  why?: string; // چرا این سری؟ چرا این کانال‌ها؟ (توضیح تحلیلی)
  wave?: 1 | 2 | 3; // موج تولید: ۱ فوری، ۲ بعدی، ۳ متوقف تا روشن‌شدن ریسک
}

export interface StrategyIdea {
  n: number;
  t: string; // عنوان
  comp: number; // رقابت 1-5 (کمتر بهتر)
  pot: number; // پتانسیل 1-5
  disc: number; // گفتمان 1-5
  ch: string[]; // کانال‌ها: zed|zaviye|tamashin|frame
  kind?: string; // سری/فرم والد
  flag?: string; // ⚠️ خط قرمز / ابهام / اولویت
  wave?: 1 | 2 | 3;
  cost?: CostTier;
}

export interface StrategyFormat {
  name: string;
  channels: string[];
  cost: CostTier;
  role: string;
  note?: string;
}

export interface StrategyCollab {
  weeks: string;
  colIran: string;
  colWorld: string;
}

export interface StrategyChartDemand {
  label: string;
  value: number; // هزار بازدید (میانه ۵ ویدیوی برتر)
  highlight?: boolean;
}

export interface StrategyChartTrend {
  months: string[];
  lines: { name: string; color: string; values: (number | null)[] }[];
  source: string;
}

export interface StrategyChartCompare {
  label: string;
  recent: number | null; // بهترین ۱۲ ماه اخیر (هزار بازدید)
  allTime: number | null; // مرجع همه‌زمان
}

export interface StrategyTopic {
  id: string;
  title: string;
  parentId?: string; // اگر زیرمجموعه یک والد باشد
  status: "پیش‌نویس" | "بسته" | "در حال انتشار";
  version: string;
  audience: string;
  goal: string;
  houseFormat?: { name: string; desc: string; structure: string[] };
  competitors: { name: string; form: string; scale: string; gap: string }[];
  strategyNote?: string;
  series: StrategySeries[];
  ideas: StrategyIdea[];
  topStart: { t: string; why: string }[];
  formats: StrategyFormat[];
  hooks: string[];
  collabs: StrategyCollab[];
  kpis: { series: string; views: string; retention: string; ctr: string; note: string }[];
  spinoffs: { name: string; verdict: string }[];
  redlines: string[];
  redlinesOpen: boolean;
  // اصل ثابت: شورتس محتوای جدا نیست، مکمل ویدیوی کامل است (قیف ورود + بازنشر).
  shortsPolicy?: string;
  readingGuide?: string; // راهنمای خواندن پرونده + منطق کلی امتیازدهی
  collabLogic?: string; // منطق نقشه کلب دوقلو
  redlineNote?: string; // توضیح وضعیت خط قرمزها
  charts?: {
    demand?: StrategyChartDemand[]; // میله‌ای تقاضا (هزار بازدید)
    demandSource?: string;
    trend?: StrategyChartTrend; // خطی روند ماهانه
    compare?: StrategyChartCompare[]; // میله‌ای دوبل ۱۲ماه اخیر vs همه‌زمان
    compareSource?: string;
  };
}

export const CHANNEL_FA: Record<string, string> = {
  zed: "ضدروایت",
  zaviye: "زاویه نو",
  tamashin: "تماشین",
  frame: "ایرانیان فریم",
};

export function stars(n: number): string {
  return "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(5 - Math.max(0, Math.min(5, n)));
}
