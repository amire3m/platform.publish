// Telegram live conductor: menu rendering + callback handling.
// Pure helpers are unit-tested; handleLiveCallback wires DB/Telegram.
import type { OverlayPosition } from "./yt-dlp";

export type LiveTgAction =
  | "menu"
  | "start"
  | "stop"
  | "skip"
  | "schedule_menu"
  | "channel_menu"
  | "settings_menu";

export interface TgButton {
  text: string;
  callback_data: string;
}

export interface LivePanelView {
  text: string;
  keyboard: TgButton[][];
}

export const LIVE_CB_PREFIX = "live";

/** Sentinel error thrown when the panel message can no longer be edited. */
export const LIVE_PANEL_EDIT_ERROR = "LIVE_PANEL_EDIT_GONE";

export function cb(action: string, arg = ""): string {
  return arg ? `${LIVE_CB_PREFIX}:${action}:${arg}` : `${LIVE_CB_PREFIX}:${action}`;
}

export function parseLiveCallback(data: string): { action: string; arg: string } | null {
  const parts = data.split(":");
  if (parts[0] !== LIVE_CB_PREFIX || parts.length < 2) return null;
  return { action: parts[1], arg: parts.slice(2).join(":") };
}

// ---------------------------------------------------------------------------
// Session status rendering
// ---------------------------------------------------------------------------
export interface PublicQueueItem {
  videoId: string;
  title: string;
  durationSec: number | null;
  status: string;
}

export interface PublicSession {
  state: string;
  isActive?: boolean;
  quality?: string;
  loop?: boolean;
  rtmpTarget?: string | null;
  queue: PublicQueueItem[];
  currentIndex: number;
  currentElapsedSec: number;
  error?: string | null;
  sourceType?: "playlist" | "m3u8";
  elapsedTotalSec?: number;
  plannedTotalSec?: number;
  remainingSec?: number | null;
  positionPct?: number | null;
  nextItem?: { title: string; startAtSec: number } | null;
}

const STATE_FA: Record<string, string> = {
  idle: "غیرفعال",
  starting: "در حال آماده‌سازی",
  live: "🔴 زنده",
  stopping: "در حال توقف",
  stopped: "پایان یافت",
  error: "خطا",
};

export function formatSessionStatus(s: PublicSession | null): string {
  if (!s || s.state === "idle" || !s.isActive) {
    return "⚫️ <b>استریم فعالی وجود ندارد</b>";
  }
  const lines: string[] = [`<b>${STATE_FA[s.state] ?? s.state}</b>`, ""];
  const current = s.currentIndex >= 0 ? s.queue[s.currentIndex] : null;
  if (current) {
    const elapsed = formatDur(s.currentElapsedSec);
    const total = current.durationSec != null ? formatDur(current.durationSec) : "—";
    lines.push(`▶️ <b>${escapeHtml(current.title)}</b>`);
    lines.push(`⏱ دقیقه ${elapsed} از ${total} · (${s.currentIndex + 1} از ${s.queue.length})`);
    if (s.quality) lines.push(`🎚 کیفیت: ${s.quality}p`);
  } else {
    lines.push("در حال آماده‌سازی ویدیوی اول...");
  }
  if ((s.sourceType ?? "playlist") === "playlist" && (s.plannedTotalSec ?? 0) > 0) {
    lines.push("", `📍 موقعیت در برنامه: دقیقه ${formatDur(s.elapsedTotalSec ?? 0)} از ${formatDur(s.plannedTotalSec ?? 0)} (${s.positionPct ?? 0}٪)`);
    if (s.remainingSec != null) lines.push(`⏳ مانده تا پایان چرخه: ${formatDur(s.remainingSec)}`);
    if (s.nextItem) lines.push(`⏭ بعدی: ${escapeHtml(s.nextItem.title.slice(0, 40))}`);
  }
  if (s.error) lines.push("", `⚠️ ${escapeHtml(s.error)}`);
  return lines.join("\n");
}

export function formatDur(total: number | null): string {
  if (total == null || !isFinite(total)) return "—";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.floor(total % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Keyboards
// ---------------------------------------------------------------------------
export function mainMenuKeyboard(s: PublicSession | null): TgButton[][] {
  const active = !!s?.isActive;
  if (active) {
    return [
      [{ text: "⏭ رد کردن", callback_data: cb("skip") }, { text: "⏹ توقف", callback_data: cb("stop") }],
      [{ text: "🔄 بروزرسانی", callback_data: cb("menu") }],
    ];
  }
  return [
    [{ text: "▶️ شروع لایو", callback_data: cb("start") }],
    [
      { text: "📅 برنامه‌ها", callback_data: cb("schedule_menu") },
      { text: "📺 کانال‌ها", callback_data: cb("channel_menu") },
    ],
    [{ text: "⚙️ تنظیمات", callback_data: cb("settings_menu") }, { text: "🔄 بروزرسانی", callback_data: cb("menu") }],
  ];
}

export function channelPickKeyboard(channels: { id: string; name: string }[]): TgButton[][] {
  const rows: TgButton[][] = channels.map((c) => [{ text: c.name, callback_data: cb("pick_channel", c.id) }]);
  rows.push([{ text: "◀️ بازگشت", callback_data: cb("menu") }]);
  return rows;
}

export function confirmStartKeyboard(channelId: string, playlistInput: string, quality: string, loop: boolean): TgButton[][] {
  const arg = [channelId, playlistInput, quality, loop ? "1" : "0"].map(encodeURIComponent).join("|");
  return [
    [{ text: "🚀 شروع", callback_data: cb("go", arg) }],
    [
      { text: `کیفیت: ${quality}`, callback_data: cb("toggle_quality", arg) },
      { text: `تکرار: ${loop ? "روشن" : "خاموش"}`, callback_data: cb("toggle_loop", arg) },
    ],
    [{ text: "◀️ بازگشت", callback_data: cb("start") }],
  ];
}

// ---------------------------------------------------------------------------
// Settings view (logo overlay)
// ---------------------------------------------------------------------------
export interface LiveSettingsView {
  logoPath: string;
  position: string;
  opacity: number;
}

export function formatSettings(v: LiveSettingsView): string {
  return [
    "⚙️ <b>تنظیمات لایو</b>",
    "",
    `🖼 لوگو: ${v.logoPath ? `<code>${escapeHtml(v.logoPath)}</code>` : "— تنظیم نشده —"}`,
    `📍 موقعیت: ${positionFa(v.position as OverlayPosition)} · شفافیت: ${Math.round(v.opacity * 100)}%`,
    "",
    "<i>لوگو فقط در حالت 720p اعمال می‌شود.</i>",
  ].join("\n");
}

export function settingsKeyboard(v: LiveSettingsView): TgButton[][] {
  const positions: OverlayPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const arg = encodeURIComponent(v.position);
  return [
    [{ text: `📍 موقعیت: ${positionFa(v.position as OverlayPosition)}`, callback_data: cb("cycle_position", arg) }],
    [
      { text: "شفافیت −", callback_data: cb("opacity_down") },
      { text: "شفافیت +", callback_data: cb("opacity_up") },
    ],
    [{ text: "🗑 حذف لوگو", callback_data: cb("clear_logo") }],
    [{ text: "◀️ بازگشت", callback_data: cb("menu") }],
  ];
}

export function positionFa(p: OverlayPosition | string): string {
  switch (p) {
    case "top-left": return "بالا چپ";
    case "top-right": return "بالا راست";
    case "bottom-left": return "پایین چپ";
    case "bottom-right": return "پایین راست";
    default: return String(p);
  }
}

export const NEXT_POSITION: Record<OverlayPosition, OverlayPosition> = {
  "top-left": "top-right",
  "top-right": "bottom-right",
  "bottom-right": "bottom-left",
  "bottom-left": "top-left",
};

// ---------------------------------------------------------------------------
// Schedules view
// ---------------------------------------------------------------------------
export interface ScheduleView {
  id: string;
  name: string;
  startTehran: string;
  endTehran: string | null;
  daysOfWeek: number[];
  enabled: boolean;
  channelName: string | null;
}

export function formatSchedules(rows: ScheduleView[]): string {
  if (rows.length === 0) return "📅 <b>برنامه‌ها</b>\n\nهنوز برنامه‌ای ثبت نشده است.";
  const DAY = ["ی", "د", "س", "چ", "پ", "ج", "ش"];
  const lines = rows.map((s) => {
    const days = s.daysOfWeek.length === 7 ? "هر روز" : s.daysOfWeek.map((d) => DAY[d] ?? "?").join("،");
    return `${s.enabled ? "🟢" : "⚪️"} <b>${escapeHtml(s.name)}</b>\n   ${s.startTehran}${s.endTehran ? `–${s.endTehran}` : ""} · ${days} · ${escapeHtml(s.channelName ?? "?")}`;
  });
  return ["📅 <b>برنامه‌ها</b>", "", ...lines].join("\n");
}

export function schedulesKeyboard(rows: ScheduleView[]): TgButton[][] {
  const kb: TgButton[][] = rows.map((s) => [
    { text: s.enabled ? "⛔️ غیرفعال" : "✅ فعال", callback_data: cb("sched_toggle", s.id) },
    { text: "🗑", callback_data: cb("sched_delete", s.id) },
    { text: s.name.slice(0, 16), callback_data: cb("noop") },
  ]);
  kb.push([{ text: "◀️ بازگشت", callback_data: cb("menu") }]);
  return kb;
}

// ---------------------------------------------------------------------------
// Channels view
// ---------------------------------------------------------------------------
export function formatChannels(rows: { id: string; name: string; rtmpUrl: string; isActive: boolean }[]): string {
  if (rows.length === 0) return "📺 <b>کانال‌ها</b>\n\nهنوز کانالی ذخیره نشده است.\nاز پنل وب تب «کانال‌ها» اضافه کنید.";
  return [
    "📺 <b>کانال‌ها</b>",
    "",
    ...rows.map((c) => `${c.isActive ? "🟢" : "⚪️"} <b>${escapeHtml(c.name)}</b>\n   <code>${escapeHtml(c.rtmpUrl)}</code>`),
  ].join("\n");
}

export function channelsKeyboard(rows: { id: string; name: string; isActive: boolean }[]): TgButton[][] {
  const kb: TgButton[][] = rows.map((c) => [
    { text: c.isActive ? "⛔️ غیرفعال" : "✅ فعال", callback_data: cb("chan_toggle", c.id) },
    { text: c.name.slice(0, 20), callback_data: cb("noop") },
  ]);
  kb.push([{ text: "◀️ بازگشت", callback_data: cb("menu") }]);
  return kb;
}
