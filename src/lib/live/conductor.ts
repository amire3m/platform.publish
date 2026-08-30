// Live conductor: daily-recurring schedule engine.
// Pure window/decision logic is unit-tested; runLiveConductorTick wires real
// dependencies (DB, streamer, Telegram) and is invoked from instrumentation.
import { DateTime } from "luxon";
import type { LiveQuality } from "./yt-dlp";

export interface ConductorSchedule {
  id: string;
  name: string;
  channelRef: string;
  playlistInput: string;
  quality: LiveQuality;
  loop: boolean;
  overlayEnabled: boolean;
  startTehran: string;
  endTehran: string | null;
  daysOfWeek: number[];
  enabled: boolean;
  lastStartedAt: Date | null;
}

export interface LiveConductorDeps {
  now: () => DateTime;
  isActiveSession: () => boolean;
  activeSession: () => { scheduleRef: string | null } | null;
  listSchedules: () => Promise<ConductorSchedule[]>;
  startSession: (schedule: ConductorSchedule) => Promise<void>;
  stopSession: (reason: string) => boolean;
  markScheduleStarted: (id: string) => Promise<void>;
  markScheduleError: (id: string, error: string) => Promise<void>;
  notify: (action: string, detail: Record<string, unknown>) => Promise<void>;
}

function parseHHMM(s: string): number | null {
  const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Is minute-of-day inside [start, end)? Midnight-spanning windows supported. */
export function isWithinWindow(minuteOfDay: number, start: string, end: string | null): boolean {
  const s = parseHHMM(start);
  if (s === null) return false;
  if (end === null) return minuteOfDay >= s;
  const e = parseHHMM(end);
  if (e === null) return minuteOfDay >= s;
  if (s <= e) return minuteOfDay >= s && minuteOfDay < e;
  return minuteOfDay >= s || minuteOfDay < e; // spans midnight
}

/** Is minute-of-day past the end of a window (for auto-stop)? */
export function pastEnd(minuteOfDay: number, start: string, end: string | null): boolean {
  if (end === null) return false;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null) return false;
  if (s <= e) return minuteOfDay >= e;
  return minuteOfDay >= e && minuteOfDay < s; // spans midnight: past end until next start
}

/** Schedules due to start right now (day matches, inside window, not started today). */
export function dueSchedules(schedules: ConductorSchedule[], now: DateTime): ConductorSchedule[] {
  const jsDay = now.weekday % 7; // luxon 1=Mon..7=Sun → JS 0=Sun..6=Sat
  const startOfTehranDay = now.startOf("day");
  return schedules.filter((s) => {
    if (!s.daysOfWeek.includes(jsDay)) return false;
    if (!isWithinWindow(now.hour * 60 + now.minute, s.startTehran, s.endTehran)) return false;
    if (s.lastStartedAt && DateTime.fromJSDate(s.lastStartedAt).setZone("Asia/Tehran") >= startOfTehranDay) {
      return false;
    }
    return true;
  });
}

export async function runLiveConductorTick(deps: LiveConductorDeps): Promise<void> {
  const now = deps.now();
  const schedules = await deps.listSchedules();
  const active = deps.isActiveSession() ? deps.activeSession() : null;

  // 1. Auto-stop: schedule-run session past its end time.
  if (active?.scheduleRef) {
    const s = schedules.find((x) => x.id === active.scheduleRef);
    if (s && pastEnd(now.hour * 60 + now.minute, s.startTehran, s.endTehran)) {
      if (deps.stopSession("schedule_end")) {
        await deps.notify("live_stopped", { reason: "schedule_end", schedule: s.name, scheduleRef: s.id });
      }
      return;
    }
  }

  // 2. Auto-start: first due schedule when no active session.
  if (active || deps.isActiveSession()) return;
  const due = dueSchedules(schedules, now);
  if (due.length === 0) return;
  const schedule = due[0];
  try {
    await deps.startSession(schedule);
    await deps.markScheduleStarted(schedule.id);
    await deps.notify("live_schedule_started", { schedule: schedule.name, scheduleRef: schedule.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای نامشخص";
    await deps.markScheduleError(schedule.id, message).catch(() => {});
    await deps.notify("live_schedule_error", { schedule: schedule.name, error: message }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Real dependency wiring (DB + streamer + Telegram)
// ---------------------------------------------------------------------------
export async function reconcileInterruptedSessions(): Promise<void> {
  const { db } = await import("@/db");
  const { liveSessions } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");
  // A fresh process has no in-memory session → any 'live' DB row is stale.
  await db
    .update(liveSessions)
    .set({ state: "interrupted", finishedAt: new Date(), updatedAt: new Date() })
    .where(inArray(liveSessions.state, ["live", "stopping"]));
}

async function loadOverlayConfig(): Promise<import("./yt-dlp").OverlayConfig | null> {
  const { db } = await import("@/db");
  const { appSettings } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  const live = (row?.capabilityConfig as Record<string, unknown> | undefined)?.live as
    | { logoPath?: string; position?: string; opacity?: number }
    | undefined;
  if (!live?.logoPath) return null;
  const position = (["top-left", "top-right", "bottom-left", "bottom-right"] as const).includes(
    live.position as never,
  )
    ? (live.position as "top-left" | "top-right" | "bottom-left" | "bottom-right")
    : "top-right";
  return { logoPath: live.logoPath, position, opacity: Math.min(1, Math.max(0, live.opacity ?? 0.8)) };
}

async function notifyLive(action: string, detail: Record<string, unknown>): Promise<void> {
  try {
    const { getTelegramConfig, TelegramClient } = await import("@/lib/telegram/client");
    const cfg = getTelegramConfig();
    if (!cfg) return;
    const { db } = await import("@/db");
    const { telegramTopics } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [topic] = await db.select().from(telegramTopics).where(eq(telegramTopics.key, "live_alerts")).limit(1);
    const text = formatLiveMessage(action, detail);
    if (!text) return;
    const client = new TelegramClient(cfg);
    await client.sendMessage(text, topic?.messageThreadId ?? undefined, { parseMode: "HTML" });
  } catch (err) {
    console.error("[live] notify failed:", err instanceof Error ? err.message : err);
  }
}

function formatLiveMessage(action: string, d: Record<string, unknown>): string | null {
  const name = (d.schedule as string) ?? "";
  switch (action) {
    case "live_schedule_started":
      return `🔴 <b>شروع خودکار لایو</b>\nبرنامه: ${name}`;
    case "live_started":
      return `🔴 <b>لایو شروع شد</b>\nآیتم‌ها: ${String(d.items ?? "")}`;
    case "live_stopped": {
      const reason = d.reason === "schedule_end" ? "پایان بازه برنامه" : d.reason === "manual" ? "توقف دستی" : "پایان پلی‌لیست";
      const stats = d.stats as { itemsPlayed?: number; itemsFailed?: number; secondsStreamed?: number } | undefined;
      const mins = stats?.secondsStreamed ? Math.round(stats.secondsStreamed / 60) : null;
      return `⏹ <b>لایو پایان یافت</b>\nعلت: ${reason}${name ? `\nبرنامه: ${name}` : ""}${
        mins !== null ? `\nمدت: ~${mins} دقیقه` : ""
      }${stats ? `\nپخش‌شده: ${stats.itemsPlayed ?? 0} · ناموفق: ${stats.itemsFailed ?? 0}` : ""}`;
    }
    case "live_schedule_error":
      return `⚠️ <b>خطای شروع خودکار لایو</b>\nبرنامه: ${name}\nخطا: ${String(d.error ?? "")}`;
    case "live_error":
      return `⚠️ <b>خطای لایو</b>\n${String(d.error ?? "")}`;
    default:
      return null;
  }
}

/** Tick with real dependencies — called from instrumentation every 60s. */
export async function runLiveConductorTickReal(): Promise<void> {
  const { db } = await import("@/db");
  const { liveChannels, liveSchedules, liveSessions } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { decryptSecret } = await import("@/lib/crypto");
  const { generateEntityId } = await import("@/lib/ids");
  const { getStreamer, persistSessionSnapshot } = await import("./playlist-streamer");

  const deps: LiveConductorDeps = {
    now: () => DateTime.now().setZone("Asia/Tehran"),
    isActiveSession: () => getStreamer().isActive(),
    activeSession: () => {
      const s = getStreamer().session;
      return s ? { scheduleRef: s.scheduleRef } : null;
    },
    listSchedules: async () => {
      const rows = await db.select().from(liveSchedules).where(eq(liveSchedules.enabled, true));
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        channelRef: r.channelRef,
        playlistInput: r.playlistInput,
        quality: r.quality,
        loop: r.loop,
        overlayEnabled: r.overlayEnabled,
        startTehran: r.startTehran,
        endTehran: r.endTehran,
        daysOfWeek: r.daysOfWeek,
        enabled: r.enabled,
        lastStartedAt: r.lastStartedAt,
      }));
    },
    startSession: async (s) => {
      const [channel] = await db.select().from(liveChannels).where(eq(liveChannels.id, s.channelRef)).limit(1);
      if (!channel || !channel.isActive) throw new Error("کانال فعال پیدا نشد.");
      const streamKey = decryptSecret(channel.streamKeyEncrypted);
      const overlay = s.overlayEnabled ? await loadOverlayConfig() : null;
      const sessionId = generateEntityId("LSE");
      await db.insert(liveSessions).values({
        id: sessionId,
        scheduleRef: s.id,
        channelRef: channel.id,
        playlistInput: s.playlistInput,
        quality: s.quality,
        loop: s.loop,
        overlayEnabled: s.overlayEnabled,
        trigger: "schedule",
        state: "live",
        startedAt: new Date(),
        updatedAt: new Date(),
      });
      await getStreamer().start({
        playlistInput: s.playlistInput,
        rtmpUrl: channel.rtmpUrl,
        streamKey,
        quality: s.quality,
        loop: s.loop,
        maxItems: 200,
        sessionId,
        overlayEnabled: s.overlayEnabled,
        overlay,
        scheduleRef: s.id,
        channelRef: channel.id,
      });
    },
    stopSession: (reason) => getStreamer().stop(reason),
    markScheduleStarted: async (id) => {
      await db
        .update(liveSchedules)
        .set({ lastStartedAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(liveSchedules.id, id));
    },
    markScheduleError: async (id, error) => {
      await db.update(liveSchedules).set({ lastError: error, updatedAt: new Date() }).where(eq(liveSchedules.id, id));
    },
    notify: notifyLive,
  };

  await runLiveConductorTick(deps);
}
