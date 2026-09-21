// -----------------------------------------------------------------------------
// Per-account publish scheduling: daily caps, cooldowns, daily windows, jitter.
// -----------------------------------------------------------------------------
// Pure logic (Asia/Tehran wall clock) — the worker in src/lib/worker.ts only
// wires these decisions to the DB. Iran observes a fixed +3:30 offset (no DST
// since 2022), so Tehran-day arithmetic below is exact.

export interface PublishScheduleSettings {
  /** Max successful publishes per Tehran day (null = unlimited). */
  dailyCap: number | null;
  /** Min minutes between two publishes on the account (null = none). */
  cooldownMin: number | null;
  /** Daily window start "HH:MM" Asia/Tehran (null = no window). */
  windowStart: string | null;
  /** Daily window end "HH:MM" Asia/Tehran (null = no window). */
  windowEnd: string | null;
  /** Random 0..N minute stagger for new arrivals. */
  jitterMin: number;
  /** Publish new arrivals on the next tick (skip the stagger). */
  instantPost: boolean;
}

export interface PublishUsage {
  lastPublishedAt: Date | string | null;
  /** Tehran YYYY-MM-DD that `count` belongs to. */
  day: string | null;
  count: number;
}

export type GateReason = "window" | "cap" | "cooldown";

export type GateResult =
  | { ok: true }
  | { ok: false; reason: GateReason; retryAfterMs: number; message: string };

const TEHRAN_TZ = "Asia/Tehran";
const TEHRAN_OFFSET_MS = 3.5 * 3600 * 1000;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TEHRAN_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TEHRAN_TZ, hour: "2-digit", minute: "2-digit", hour12: false });

/** Tehran calendar day "YYYY-MM-DD" for an instant. */
export function tehranDayKey(d: Date): string {
  return dayFmt.format(d);
}

/** Tehran wall-clock "HH:MM" for an instant. */
export function tehranHHMM(d: Date): string {
  return hmFmt.format(d);
}

/** Start of the next Tehran day as a Date (for cap retry-after). */
export function nextTehranMidnight(from: Date): Date {
  const [y, m, day] = tehranDayKey(from).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1) - TEHRAN_OFFSET_MS);
}

function cleanHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return HHMM_RE.test(t) ? t : null;
}

function cleanNonNegInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/** Normalize a DB account row (camelCase or snake_case) into settings. */
export function normalizeScheduleSettings(raw: Record<string, unknown>): PublishScheduleSettings {
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) if (raw[k] !== undefined) return raw[k];
    return undefined;
  };
  return {
    dailyCap: cleanNonNegInt(pick("publishDailyCap", "publish_daily_cap")) ?? null,
    cooldownMin: cleanNonNegInt(pick("publishCooldownMin", "publish_cooldown_min")) ?? null,
    windowStart: cleanHHMM(pick("publishWindowStart", "publish_window_start")),
    windowEnd: cleanHHMM(pick("publishWindowEnd", "publish_window_end")),
    jitterMin: cleanNonNegInt(pick("publishJitterMin", "publish_jitter_min")) ?? 0,
    instantPost: pick("instantPost", "instant_post") === true,
  };
}

/** True when `now` falls inside the daily window (supports overnight wraps). */
export function inPublishWindow(now: Date, start: string | null, end: string | null): boolean {
  const s = cleanHHMM(start);
  const e = cleanHHMM(end);
  if (!s || !e) return true;
  const nowHm = tehranHHMM(now);
  if (s <= e) return s <= nowHm && nowHm <= e;
  return nowHm >= s || nowHm <= e;
}

/** Random 0..jitterMin minutes in ms (injectable rand for tests). */
export function jitterDelayMs(jitterMin: number, rand: () => number = Math.random): number {
  const n = Math.max(0, Math.floor(jitterMin));
  if (n <= 0) return 0;
  return Math.floor(rand() * n * 60 * 1000);
}

/**
 * Gate a single publish attempt. Order: window → cap → cooldown.
 * Skipped gates never consume attempts — the caller must leave the target
 * scheduled (optionally with next_retry_at = now + retryAfterMs).
 */
export function checkPublishGate(now: Date, settings: PublishScheduleSettings, usage: PublishUsage): GateResult {
  if (!inPublishWindow(now, settings.windowStart, settings.windowEnd)) {
    return { ok: false, reason: "window", retryAfterMs: 60 * 1000, message: "خارج از پنجره انتشار روزانه." };
  }
  if (settings.dailyCap !== null) {
    const today = tehranDayKey(now);
    const effective = usage.day === today ? Math.max(0, Math.floor(usage.count)) : 0;
    if (effective >= settings.dailyCap) {
      return {
        ok: false,
        reason: "cap",
        retryAfterMs: Math.max(60 * 1000, nextTehranMidnight(now).getTime() - now.getTime()),
        message: "سقف انتشار روزانه این حساب پر شده است.",
      };
    }
  }
  if (settings.cooldownMin !== null && settings.cooldownMin > 0 && usage.lastPublishedAt) {
    const last = new Date(usage.lastPublishedAt).getTime();
    if (Number.isFinite(last)) {
      const availableAt = last + settings.cooldownMin * 60 * 1000;
      if (now.getTime() < availableAt) {
        return {
          ok: false,
          reason: "cooldown",
          retryAfterMs: availableAt - now.getTime(),
          message: "فاصله زمانی بین دو انتشار رعایت نشده است.",
        };
      }
    }
  }
  return { ok: true };
}
