/** Minimal RFC-4180-ish CSV parser (quotes, commas, newlines). No dependencies. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const clean = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (ch === "\r") {
      continue;
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

export type BoardField =
  | "channel" | "date" | "videoTitle" | "program" | "contentType" | "views"
  | "watchMinutes" | "avgViewSeconds" | "impressions" | "ctr" | "likes"
  | "comments" | "shares" | "subsGained" | "subsLost" | "subsTotal"
  | "monetized" | "country" | "trafficSource";

const HEADER_ALIASES: Record<string, BoardField> = {
  "نام کانال": "channel", channel: "channel", "channel name": "channel", "channel_title": "channel",
  "تاریخ": "date", date: "date", "upload date": "date", "video publish time": "date",
  "عنوان ویدیو": "videoTitle", "video title": "videoTitle", title: "videoTitle", "video_title": "videoTitle",
  "نام برنامه": "program", program: "program", series: "program", playlist: "program", show: "program",
  "نوع محتوا": "contentType", "content type": "contentType",
  "تعداد بازدید": "views", views: "views", "video views": "views",
  "زمان تماشا": "watchMinutes", "watch time": "watchMinutes", "watch_time_minutes": "watchMinutes",
  "میانگین زمان تماشا": "avgViewSeconds", "average view duration": "avgViewSeconds",
  "تعداد نمایش": "impressions", impressions: "impressions",
  "نرخ کلیک": "ctr", ctr: "ctr", "click through rate": "ctr", "impressions click-through rate": "ctr",
  "تعداد لایک": "likes", likes: "likes",
  "تعداد کامنت": "comments", comments: "comments",
  "تعداد اشتراک‌گذاری": "shares", shares: "shares",
  "تعداد مشترک جدید": "subsGained", "subscribers gained": "subsGained", "subscribers_gained": "subsGained",
  "تعداد مشترک از دست‌رفته": "subsLost", "subscribers lost": "subsLost",
  "تعداد مشترکان فعلی": "subsTotal", subscribers: "subsTotal",
  "وضعیت مانیتایز": "monetized", monetization: "monetized",
  "کشور یا منطقه مخاطب": "country", country: "country", geography: "country",
  "منبع ورودی بازدید": "trafficSource", "traffic source": "trafficSource",
};

/** Auto-map header cells to fields (case-insensitive, trimmed). Unmatched → null. */
export function mapHeaders(header: string[]): Array<BoardField | null> {
  return header.map((h) => {
    const key = h.trim().toLowerCase();
    if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
    const exact = HEADER_ALIASES[h.trim()];
    return exact ?? null;
  });
}

function toNum(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(String(raw).replace(/,/g, "").replace(/٪/g, "").replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toNumOrNull(raw: string | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export interface MappedDataset {
  rows: Array<Record<BoardField, string>>;
  unmapped: string[];
}

/** Apply a header mapping to data rows (skips fully-empty rows). */
export function applyMapping(header: string[], data: string[][], mapping: Array<BoardField | null>): MappedDataset {
  const rows: Array<Record<BoardField, string>> = [];
  for (const line of data) {
    const rec = {} as Record<BoardField, string>;
    let empty = true;
    mapping.forEach((field, i) => {
      if (!field) return;
      const v = (line[i] ?? "").trim();
      rec[field] = v;
      if (v) empty = false;
    });
    if (!empty) rows.push(rec);
  }
  const unmapped = header.filter((_, i) => !mapping[i]);
  return { rows, unmapped };
}

export interface ValidationIssue {
  row: number;
  field: string;
  message: string;
}

export function validateMapped(rows: Array<Record<BoardField, string>>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  rows.forEach((r, i) => {
    if (!r.channel) issues.push({ row: i + 1, field: "channel", message: "کانال خالی است" });
    if (r.date && Number.isNaN(Date.parse(r.date))) issues.push({ row: i + 1, field: "date", message: "تاریخ نامعتبر است" });
    if (r.views && Number.isNaN(Number(String(r.views).replace(/,/g, "")))) issues.push({ row: i + 1, field: "views", message: "بازدید عدد نیست" });
  });
  return issues;
}

export function toCsvRow(r: Record<BoardField, string>): import("./types").CsvRow {
  return {
    channel: r.channel ?? "",
    date: r.date ?? "",
    videoTitle: r.videoTitle ?? "",
    program: r.program ?? "نامشخص",
    contentType: r.contentType ?? "نامشخص",
    views: toNum(r.views),
    watchMinutes: toNum(r.watchMinutes),
    avgViewSeconds: toNumOrNull(r.avgViewSeconds),
    impressions: toNumOrNull(r.impressions),
    ctr: toNumOrNull(r.ctr),
    likes: toNum(r.likes),
    comments: toNum(r.comments),
    shares: toNum(r.shares),
    subsGained: toNum(r.subsGained),
    subsLost: toNum(r.subsLost),
    subsTotal: toNumOrNull(r.subsTotal),
    monetized: r.monetized ?? "",
    country: r.country ?? "",
    trafficSource: r.trafficSource ?? "",
  };
}
