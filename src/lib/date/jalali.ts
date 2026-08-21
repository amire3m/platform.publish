// -----------------------------------------------------------------------------
// Central date/time conversion layer.
// -----------------------------------------------------------------------------
// This is the ONLY module in the codebase that is allowed to convert between
// Gregorian/UTC and the Jalali (Persian/Hijri Shamsi) calendar. Every other
// part of the app (UI components, API routes, the worker) must import from
// here instead of re-implementing conversion logic. This guarantees a single
// source of truth for date handling and makes leap-year / Nowruz edge cases
// easy to test in one place (see the accompanying tests).
//
// Libraries used:
//  - `jalaali-js` for pure Gregorian <-> Jalali day conversion (well tested,
//    handles Jalali leap years correctly using the 33-year cycle algorithm).
//  - `luxon` for timezone-aware UTC <-> Asia/Tehran wall-clock conversion.
// -----------------------------------------------------------------------------
import * as jalaali from "jalaali-js";
import { DateTime } from "luxon";

export const APP_TIMEZONE = "Asia/Tehran";

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const WEEKDAY_LABELS_FA = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
  "شنبه",
];
const MONTH_LABELS_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

export interface JalaliDateTimeParts {
  jy: number;
  jm: number; // 1-12
  jd: number; // 1-31
  hour: number;
  minute: number;
}

/** Convert any digit string (Latin or Persian) to Persian digits for display. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** Convert Persian (or Arabic-Indic) digits typed by the user back to Latin digits. */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** Convert a UTC ISO 8601 string (or Date) into Jalali wall-clock parts in Asia/Tehran. */
export function utcToJalaliParts(utcIso: string | Date): JalaliDateTimeParts {
  const dt =
    typeof utcIso === "string"
      ? DateTime.fromISO(utcIso, { zone: "utc" }).setZone(APP_TIMEZONE)
      : DateTime.fromJSDate(utcIso, { zone: "utc" }).setZone(APP_TIMEZONE);
  const { jy, jm, jd } = jalaali.toJalaali(dt.year, dt.month, dt.day);
  return { jy, jm, jd, hour: dt.hour, minute: dt.minute };
}

/** Format a UTC ISO timestamp as a human Jalali string, e.g. "شنبه ۱۸ اردیبهشت ۱۴۰۵ ساعت ۲۰:۳۰". */
export function formatJalaliDateTime(utcIso: string | Date, opts?: { withWeekday?: boolean }): string {
  const dt =
    typeof utcIso === "string"
      ? DateTime.fromISO(utcIso, { zone: "utc" }).setZone(APP_TIMEZONE)
      : DateTime.fromJSDate(utcIso, { zone: "utc" }).setZone(APP_TIMEZONE);
  const { jy, jm, jd } = jalaali.toJalaali(dt.year, dt.month, dt.day);
  const weekday = WEEKDAY_LABELS_FA[dt.weekday % 7];
  const hh = toPersianDigits(String(dt.hour).padStart(2, "0"));
  const mm = toPersianDigits(String(dt.minute).padStart(2, "0"));
  const datePart = `${toPersianDigits(jd)} ${MONTH_LABELS_FA[jm - 1]} ${toPersianDigits(jy)}`;
  const prefix = opts?.withWeekday === false ? "" : `${weekday} `;
  return `${prefix}${datePart} ساعت ${hh}:${mm}`;
}

/** Short slash-formatted Jalali date+time, e.g. "1405/02/18 20:30" (Latin digits, used in TGDB payloads). */
export function formatJalaliSlash(utcIso: string | Date): string {
  const dt =
    typeof utcIso === "string"
      ? DateTime.fromISO(utcIso, { zone: "utc" }).setZone(APP_TIMEZONE)
      : DateTime.fromJSDate(utcIso, { zone: "utc" }).setZone(APP_TIMEZONE);
  const { jy, jm, jd } = jalaali.toJalaali(dt.year, dt.month, dt.day);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${jy}/${pad(jm)}/${pad(jd)} ${pad(dt.hour)}:${pad(dt.minute)}`;
}

export function formatJalaliDateOnly(utcIso: string | Date): string {
  const { jy, jm, jd } = utcToJalaliParts(utcIso);
  return `${toPersianDigits(jd)} ${MONTH_LABELS_FA[jm - 1]} ${toPersianDigits(jy)}`;
}

/**
 * Convert a Jalali date + time (as picked in the UI, interpreted in Asia/Tehran)
 * into a UTC ISO 8601 string. This is the single conversion point used by the
 * scheduling UI and the upload wizard.
 */
export function jalaliToUtcIso(jy: number, jm: number, jd: number, hour = 0, minute = 0): string {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  const dt = DateTime.fromObject(
    { year: gy, month: gm, day: gd, hour, minute, second: 0, millisecond: 0 },
    { zone: APP_TIMEZONE },
  );
  return dt.toUTC().toISO({ suppressMilliseconds: true }) as string;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm);
}

export function isJalaliLeapYear(jy: number): boolean {
  return jalaali.isLeapJalaaliYear(jy);
}

export function todayJalali(): JalaliDateTimeParts {
  return utcToJalaliParts(new Date());
}

export function nowUtcIso(): string {
  return DateTime.utc().toISO({ suppressMilliseconds: true }) as string;
}

/** Build the 6x7 day grid (with leading/trailing days from neighbour months) for a Jalali month. */
export function buildJalaliMonthGrid(jy: number, jm: number) {
  const daysInMonth = jalaliMonthLength(jy, jm);
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, 1);
  const firstOfMonth = DateTime.fromObject({ year: gy, month: gm, day: gd }, { zone: APP_TIMEZONE });
  // Luxon weekday: 1=Monday..7=Sunday. Persian week starts Saturday.
  // Map to Persian week index 0=Saturday..6=Friday
  const persianWeekday = (firstOfMonth.weekday % 7 === 6 ? 0 : (firstOfMonth.weekday % 7) + 1);
  const cells: { jy: number; jm: number; jd: number; inMonth: boolean; utcIso: string }[] = [];
  for (let i = 0; i < persianWeekday; i++) {
    const dayNum = daysInMonth /* placeholder */;
    void dayNum;
  }
  // leading days (previous month)
  let prevJy = jy;
  let prevJm = jm - 1;
  if (prevJm === 0) {
    prevJm = 12;
    prevJy -= 1;
  }
  const prevLen = jalaliMonthLength(prevJy, prevJm);
  for (let i = persianWeekday - 1; i >= 0; i--) {
    const jd = prevLen - i;
    cells.push({ jy: prevJy, jm: prevJm, jd, inMonth: false, utcIso: jalaliToUtcIso(prevJy, prevJm, jd) });
  }
  for (let jd = 1; jd <= daysInMonth; jd++) {
    cells.push({ jy, jm, jd, inMonth: true, utcIso: jalaliToUtcIso(jy, jm, jd) });
  }
  let nextJy = jy;
  let nextJm = jm + 1;
  if (nextJm === 13) {
    nextJm = 1;
    nextJy += 1;
  }
  let jd = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ jy: nextJy, jm: nextJm, jd, inMonth: false, utcIso: jalaliToUtcIso(nextJy, nextJm, jd) });
    jd += 1;
  }
  return cells;
}

export const JALALI_MONTH_LABELS = MONTH_LABELS_FA;
export const JALALI_WEEKDAY_LABELS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export function isPast(utcIso: string): boolean {
  return DateTime.fromISO(utcIso, { zone: "utc" }).toMillis() < Date.now();
}
