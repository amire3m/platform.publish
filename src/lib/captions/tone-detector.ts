import type { FaTone } from "./formulas-fa";

const KEYWORDS: Record<FaTone, RegExp> = {
  "طنز": /خنده|شوخی|طنز|باحال|😅|😂/,
  "جنجالی": /جنجال|افشا|راز|شوکه|اشتباه/,
  "انگیزشی": /انگیزه|هدف|موفقیت|شروع کن|راز موفقیت/,
  "رسمی": /بر اساس|پژوهش|آمار|گزارش|مطالعه/,
  "حرفه‌ای": /تضمینی|اثبات|پروژه|تحلیل|کارشناس/,
  "صریح": /بدون تعارف|حرف آخر|صریح/,
  "صمیمی": /دوست|قلب|عزیز|بچه‌ها/,
};

export function detectTone(text: string): FaTone {
  for (const [tone, re] of Object.entries(KEYWORDS) as Array<[FaTone, RegExp]>) {
    if (re.test(text)) return tone;
  }
  return "صمیمی";
}
