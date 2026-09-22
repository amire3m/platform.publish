export type FaTone = "صمیمی" | "رسمی" | "طنز" | "انگیزشی" | "جنجالی" | "حرفه‌ای" | "صریح";
export type FaGoal = "جذب" | "تعامل" | "اعتماد" | "فروش" | "رشد";

export interface FaFormula {
  id: string;
  goal: FaGoal;
  tones: FaTone[];
  name: string;
  template: string;
  signal: string;
}

export const FA_FORMULAS: FaFormula[] = [
  { id: "F-REACH-01", goal: "جذب", tones: ["جنجالی","صمیمی"], name: "افشاگری", template: "تا حالا اشتباه می‌کردی اگر {topic} را {mistake} انجام می‌دادی — {benefit} را از دست می‌دادی", signal: "share×10" },
  { id: "F-REACH-02", goal: "جذب", tones: ["حرفه‌ای","رسمی"], name: "داده‌افشا", template: "{percent}% از {audience} نمی‌دانند که {fact} — {takeaway}", signal: "save" },
  { id: "F-REACH-03", goal: "جذب", tones: ["صمیمی","انگیزشی"], name: "کنجکاوی", template: "کسی بهت نگفته که {topic} واقعاً {secret} است — ذخیره کن برای وقتی که {situation}", signal: "save" },
  { id: "F-ENG-01", goal: "تعامل", tones: ["صمیمی","طنز"], name: "دوراهی", template: "{optionA} یا {optionB}؟ نظرت چیه؟ کامنت کن 👇", signal: "comment" },
  { id: "F-ENG-02", goal: "تعامل", tones: ["جنجالی","صریح"], name: "حرف داغ", template: "نظر جنجالی: {hotTake} — موافقی یا نه؟", signal: "comment" },
  { id: "F-TRUST-01", goal: "اعتماد", tones: ["حرفه‌ای","رسمی"], name: "اثبات", template: "اثبات‌شده: {evidence} — {result} در {timeframe}", signal: "save" },
  { id: "F-SALES-01", goal: "فروش", tones: ["صمیمی","حرفه‌ای"], name: "رفع بهانه", template: "فکر می‌کنی {objection}؟ {rebuttal} — {cta}", signal: "DM" },
  { id: "F-GROWTH-01", goal: "رشد", tones: ["انگیزشی","صمیمی"], name: "سری", template: "قسمت {n} از سری {series}: امروز {topic} — فردا {teaser}", signal: "follow" },
];

export const FA_HOOKS: Record<FaTone, string[]> = {
  "صمیمی": ["تصور کن: {topic} همین الان جلوی توست", "ذخیره کن برای وقتی که {situation}", "راستش رو بخوای، {fact}"],
  "رسمی": ["بر اساس داده‌ها، {fact}", "بررسی‌ها نشان می‌دهد {fact}", "حقیقت: {fact}"],
  "طنز": ["POV: داری {topic} را {mistake} انجام می‌دی 😅", "وقتی {topic} را جدی نمی‌گیری..."],
  "انگیزشی": ["همین امروز {topic} را شروع کن — {benefit} منتظرته", "راز {benefit}: {secret}"],
  "جنجالی": ["تا حالا اشتباه می‌کردی اگر {topic} را {mistake} می‌کردی", "شوکه‌کننده: {fact}"],
  "حرفه‌ای": ["تضمینی: {method} → {result}", "اثبات‌شده در {audience}: {fact}"],
  "صریح": ["بدون تعارف: {hotTake}", "حرف آخر: {hotTake}"],
};

export const POWER_WORDS_FA = ["فوری","تضمینی","محرمانه","شوکه‌کننده","کشف کن","راز","انحصاری","اثبات‌شده","هدیه","هشدار","کمیاب","طلایی"];

export function hashtagsFa(topic: string): string[] {
  const base = topic.replace(/\s+/g, "_").slice(0, 20);
  return [`#${base}`, "#یادگیری", "#VideoEditing"].slice(0, 5);
}

export function pickFormula(tone: FaTone, goal: FaGoal = "جذب"): FaFormula {
  const byTone = FA_FORMULAS.filter((f) => f.tones.includes(tone) && f.goal === goal);
  if (byTone.length) return byTone[Math.floor(Math.random()*byTone.length)];
  const byGoal = FA_FORMULAS.filter((f) => f.goal === goal);
  return byGoal[0] ?? FA_FORMULAS[0];
}
