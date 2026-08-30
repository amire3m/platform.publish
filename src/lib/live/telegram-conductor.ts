// Wires the pure telegram-panel views to DB, streamer, and Telegram API.
// Invoked from the webhook callback_query handler (action === "live").
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, liveChannels, liveSchedules } from "@/db/schema";
import { hasPermission } from "@/lib/permissions";
import { getStreamer } from "./playlist-streamer";
import { startLiveFromChannel } from "./start";
import { isM3u8Source } from "./yt-dlp";
import {
  cb,
  parseLiveCallback,
  formatSessionStatus,
  mainMenuKeyboard,
  channelPickKeyboard,
  confirmStartKeyboard,
  formatChannels,
  channelsKeyboard,
  formatSchedules,
  schedulesKeyboard,
  formatSettings,
  settingsKeyboard,
  formatScenesMenu,
  scenesKeyboard,
  NEXT_POSITION,
  LIVE_PANEL_EDIT_ERROR,
  type LivePanelView,
  type LiveSettingsView,
} from "./telegram-panel";
import type { TelegramClient } from "@/lib/telegram/client";

export interface LivePanelContext {
  client: TelegramClient;
  /** edit the panel message in place */
  edit: (messageId: number, view: LivePanelView) => Promise<void>;
}

/** Edit helper that surfaces "message not editable" as the sentinel error. */
export async function safeEdit(ctx: LivePanelContext, messageId: number, view: LivePanelView): Promise<void> {
  try {
    await ctx.edit(messageId, view);
  } catch (err) {
    const msg = String((err as Error).message);
    if (msg.includes("message is not modified")) return;
    throw new Error(LIVE_PANEL_EDIT_ERROR);
  }
}

/** Post the live control panel into a group topic. */
export async function postLivePanel(threadId?: number, replyToMessageId?: number): Promise<void> {
  const { TelegramClient } = await import("@/lib/telegram/client");
  const client = TelegramClient.fromEnv();
  const s = await getStreamer().toPublic();
  const view: LivePanelView = { text: formatSessionStatus(s), keyboard: mainMenuKeyboard(s) };
  try {
    await client.sendMessage(view.text, threadId, {
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: view.keyboard },
      replyToMessageId,
    });
  } catch (err) {
    if (String((err as Error).message).includes("thread not found")) {
      await client.sendMessage(view.text, undefined, {
        parseMode: "HTML",
        replyMarkup: { inline_keyboard: view.keyboard },
        replyToMessageId,
      });
    } else {
      throw err;
    }
  }
}

const QUALITIES = ["720", "1080"] as const;

async function requireLiveTelegramUser(telegramId: string): Promise<boolean> {
  const { users } = await import("@/db/schema");
  const [u] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!u || !u.active) return false;
  const subject = { role: u.role, allowedActions: u.allowedActions, allowedAccountIds: u.allowedAccountIds };
  return hasPermission(subject, "manage_live") || hasPermission(subject, "manage_content_room") || hasPermission(subject, "publish_now");
}

async function sessionView() {
  return getStreamer().toPublic();
}

async function panelView(): Promise<LivePanelView> {
  const s = await sessionView();
  return { text: formatSessionStatus(s), keyboard: mainMenuKeyboard(s) };
}

async function editPanel(ctx: LivePanelContext, messageId: number): Promise<void> {
  await ctx.edit(messageId, await panelView());
}

async function settingsView(): Promise<LiveSettingsView> {
  const cfg = await liveGraphicsConfig();
  return {
    logoPath: cfg?.logoPath ?? "",
    position: cfg?.position ?? "top-right",
    opacity: Math.min(1, Math.max(0, cfg?.opacity ?? 0.8)),
  };
}

async function liveGraphicsConfig() {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return (row?.capabilityConfig as Record<string, unknown> | undefined)?.live as
    | { logoPath?: string; position?: string; opacity?: number; scenes?: import("./scene").Scene[]; activeSceneName?: string }
    | undefined;
}

async function saveSettings(v: LiveSettingsView): Promise<void> {
  const [current] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  const capabilityConfig = {
    ...((current?.capabilityConfig as Record<string, unknown>) ?? {}),
    live: { logoPath: v.logoPath, position: v.position, opacity: v.opacity },
  };
  await db
    .insert(appSettings)
    .values({ id: 1, capabilityConfig, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.id, set: { capabilityConfig, updatedAt: new Date() } });
}

/** Main entry: handle one `live:action[:arg]` callback. Returns toast text. */
export async function handleLiveCallback(
  data: string,
  telegramId: string,
  messageId: number | undefined,
  ctx: LivePanelContext,
): Promise<{ ok: boolean; message: string }> {
  const parsed = parseLiveCallback(data);
  if (!parsed) return { ok: false, message: "درخواست نامعتبر است." };
  if (!(await requireLiveTelegramUser(telegramId))) {
    return { ok: false, message: "شما مجوز مدیریت لایو را ندارید." };
  }
  if (!messageId) return { ok: false, message: "پنل یافت نشد." };
  const { action, arg } = parsed;
  const streamer = getStreamer();

  try {
    switch (action) {
      case "menu": {
        await editPanel(ctx, messageId);
        return { ok: true, message: "بروزرسانی شد." };
      }
      case "start": {
        const channels = (await db.select().from(liveChannels).where(eq(liveChannels.isActive, true))).map((c) => ({ id: c.id, name: c.name }));
        if (channels.length === 0) {
          await ctx.edit(messageId, { text: "⚠️ ابتدا از تب «کانال‌ها» در پنل وب یک کانال ذخیره کنید.", keyboard: [[{ text: "◀️ بازگشت", callback_data: cb("menu") }]] });
          return { ok: true, message: "کانالی وجود ندارد." };
        }
        await ctx.edit(messageId, { text: "▶️ <b>کانال مقصد را انتخاب کنید</b>", keyboard: channelPickKeyboard(channels) });
        return { ok: true, message: "کانال را انتخاب کنید." };
      }
      case "pick_channel": {
        // arg = channelId → ask for playlist via reply flow
        setPendingStart(telegramId, { channelId: arg, messageId, expiresAt: Date.now() + 10 * 60_000 });
        await ctx.edit(messageId, {
          text: "📋 <b>لینک پلی‌لیست یوتیوب یا m3u8 را به همین پیام ریپلای کنید.</b>\n\nمثال: <code>https://www.youtube.com/playlist?list=PL...</code>\nیا: <code>https://tv.example.com/live.m3u8</code>\n\n⏱ ۱۰ دقیقه فرصت دارید.",
          keyboard: [[{ text: "❌ انصراف", callback_data: cb("cancel_pending") }]],
        });
        return { ok: true, message: "منتظر پلی‌لیست…" };
      }
      case "cancel_pending": {
        clearPendingStart(telegramId);
        await editPanel(ctx, messageId);
        return { ok: true, message: "لغو شد." };
      }
      case "go": {
        // arg = channelId|playlist|quality|loop
        const [channelId, playlist, quality, loopFlag] = arg.split("|").map(decodeURIComponent);
        if (!channelId || !playlist) return { ok: false, message: "پارامترهای شروع ناقص است." };
        try {
          await startLiveFromChannel({ channelId, playlistInput: playlist, quality: quality === "1080" ? "1080" : "720", loop: loopFlag === "1" });
        } catch (err) {
          await editPanel(ctx, messageId);
          return { ok: false, message: err instanceof Error ? err.message : "شروع لایو ناموفق بود." };
        }
        await editPanel(ctx, messageId);
        return { ok: true, message: "لایو شروع شد 🔴" };
      }
      case "toggle_quality": {
        const [channelId, playlist, quality, loopFlag] = arg.split("|").map(decodeURIComponent);
        const next = quality === "1080" ? "720" : "1080";
        await ctx.edit(messageId, { text: "▶️ <b>تنظیمات شروع</b>", keyboard: confirmStartKeyboard(channelId, playlist, next, loopFlag === "1") });
        return { ok: true, message: "کیفیت تغییر کرد." };
      }
      case "toggle_loop": {
        const [channelId, playlist, quality, loopFlag] = arg.split("|").map(decodeURIComponent);
        await ctx.edit(messageId, { text: "▶️ <b>تنظیمات شروع</b>", keyboard: confirmStartKeyboard(channelId, playlist, quality, loopFlag !== "1") });
        return { ok: true, message: "تکرار تغییر کرد." };
      }
      case "stop": {
        if (!streamer.stop("manual")) return { ok: false, message: "جلسه فعالی وجود ندارد." };
        await editPanel(ctx, messageId);
        return { ok: true, message: "لایو متوقف شد." };
      }
      case "skip": {
        if (!streamer.skip()) return { ok: false, message: "جلسه فعالی وجود ندارد." };
        return { ok: true, message: "ویدیوی بعدی…" };
      }
      case "schedule_menu": {
        const rows = await listScheduleViews();
        await ctx.edit(messageId, { text: formatSchedules(rows), keyboard: schedulesKeyboard(rows) });
        return { ok: true, message: "برنامه‌ها." };
      }
      case "sched_toggle": {
        const [row] = await db.select().from(liveSchedules).where(eq(liveSchedules.id, arg)).limit(1);
        if (!row) return { ok: false, message: "برنامه پیدا نشد." };
        await db.update(liveSchedules).set({ enabled: !row.enabled, updatedAt: new Date() }).where(eq(liveSchedules.id, arg));
        const views = await listScheduleViews();
        await ctx.edit(messageId, { text: formatSchedules(views), keyboard: schedulesKeyboard(views) });
        return { ok: true, message: row.enabled ? "برنامه غیرفعال شد." : "برنامه فعال شد." };
      }
      case "sched_delete": {
        await db.delete(liveSchedules).where(eq(liveSchedules.id, arg));
        const views = await listScheduleViews();
        await ctx.edit(messageId, { text: formatSchedules(views), keyboard: schedulesKeyboard(views) });
        return { ok: true, message: "برنامه حذف شد." };
      }
      case "channel_menu": {
        const rows = await db.select().from(liveChannels).orderBy(liveChannels.createdAt);
        const views = rows.map((c) => ({ id: c.id, name: c.name, rtmpUrl: c.rtmpUrl, isActive: c.isActive }));
        await ctx.edit(messageId, { text: formatChannels(views), keyboard: channelsKeyboard(views) });
        return { ok: true, message: "کانال‌ها." };
      }
      case "chan_toggle": {
        const [row] = await db.select().from(liveChannels).where(eq(liveChannels.id, arg)).limit(1);
        if (!row) return { ok: false, message: "کانال پیدا نشد." };
        await db.update(liveChannels).set({ isActive: !row.isActive, updatedAt: new Date() }).where(eq(liveChannels.id, arg));
        const rows = await db.select().from(liveChannels).orderBy(liveChannels.createdAt);
        const views = rows.map((c) => ({ id: c.id, name: c.name, rtmpUrl: c.rtmpUrl, isActive: c.isActive }));
        await ctx.edit(messageId, { text: formatChannels(views), keyboard: channelsKeyboard(views) });
        return { ok: true, message: row.isActive ? "کانال غیرفعال شد." : "کانال فعال شد." };
      }
      case "settings_menu": {
        const v = await settingsView();
        await ctx.edit(messageId, { text: formatSettings(v), keyboard: settingsKeyboard(v) });
        return { ok: true, message: "تنظیمات." };
      }
      case "scene_menu": {
        const s = getStreamer().toPublic();
        const { parseScenes } = await import("./scene");
        const cfg = await liveGraphicsConfig();
        const { scenes, activeName } = parseScenes(cfg);
        const views = scenes.map((sc) => ({ name: sc.name, itemCount: sc.items.length, active: sc.name === (s.sceneName ?? activeName) }));
        await ctx.edit(messageId, {
          text: formatScenesMenu(views, s.sourceType === "m3u8"),
          keyboard: scenesKeyboard(views),
        });
        return { ok: true, message: "صحنه‌ها." };
      }
      case "scene_apply": {
        const { loadLiveScene } = await import("./start");
        const scene = await loadLiveScene(decodeURIComponent(arg));
        if (!scene) return { ok: false, message: "صحنه پیدا نشد." };
        if (!getStreamer().applyScene(scene)) return { ok: false, message: "جلسه فعالی وجود ندارد." };
        const instant = getStreamer().session?.sourceType === "m3u8";
        await editPanel(ctx, messageId);
        return { ok: true, message: instant ? `صحنه «${scene.name}» فوری اعمال شد.` : `صحنه «${scene.name}» از ویدیوی بعدی اعمال می‌شود.` };
      }
      case "cycle_position": {
        const v = await settingsView();
        v.position = NEXT_POSITION[v.position as keyof typeof NEXT_POSITION] ?? "top-right";
        await saveSettings(v);
        await ctx.edit(messageId, { text: formatSettings(v), keyboard: settingsKeyboard(v) });
        return { ok: true, message: `موقعیت: ${v.position}` };
      }
      case "opacity_up":
      case "opacity_down": {
        const v = await settingsView();
        v.opacity = Math.min(1, Math.max(0.1, +(v.opacity + (action === "opacity_up" ? 0.1 : -0.1)).toFixed(2)));
        await saveSettings(v);
        await ctx.edit(messageId, { text: formatSettings(v), keyboard: settingsKeyboard(v) });
        return { ok: true, message: `شفافیت: ${Math.round(v.opacity * 100)}%` };
      }
      case "clear_logo": {
        const v = await settingsView();
        v.logoPath = "";
        await saveSettings(v);
        await ctx.edit(messageId, { text: formatSettings(v), keyboard: settingsKeyboard(v) });
        return { ok: true, message: "لوگو حذف شد." };
      }
      case "noop":
        return { ok: true, message: "" };
      default:
        return { ok: false, message: "عملیات نامعتبر است." };
    }
  } catch (err) {
    console.error("[live-panel] callback failed:", err instanceof Error ? err.message : err);
    return { ok: false, message: "خطای داخلی سرور." };
  }
}

async function listScheduleViews() {
  const { users } = await import("@/db/schema");
  void users;
  const rows = await db
    .select({
      id: liveSchedules.id,
      name: liveSchedules.name,
      startTehran: liveSchedules.startTehran,
      endTehran: liveSchedules.endTehran,
      daysOfWeek: liveSchedules.daysOfWeek,
      enabled: liveSchedules.enabled,
      channelName: liveChannels.name,
    })
    .from(liveSchedules)
    .leftJoin(liveChannels, eq(liveSchedules.channelRef, liveChannels.id))
    .orderBy(liveSchedules.startTehran);
  return rows;
}

// ---------------------------------------------------------------------------
// Pending "reply with playlist" conversation state (in-memory, per process)
// ---------------------------------------------------------------------------
interface PendingStart {
  channelId: string;
  messageId: number;
  expiresAt: number;
}

const globalStore = globalThis as unknown as { __livePendingStarts?: Map<string, PendingStart> };

function pendingMap(): Map<string, PendingStart> {
  if (!globalStore.__livePendingStarts) globalStore.__livePendingStarts = new Map();
  return globalStore.__livePendingStarts;
}

export function setPendingStart(telegramId: string, pending: PendingStart): void {
  pendingMap().set(telegramId, pending);
}

export function clearPendingStart(telegramId: string): void {
  pendingMap().delete(telegramId);
}

/** Consume a pending start if fresh; returns null otherwise. */
export function consumePendingStart(telegramId: string): PendingStart | null {
  const map = pendingMap();
  const p = map.get(telegramId);
  if (!p) return null;
  map.delete(telegramId);
  if (p.expiresAt < Date.now()) return null;
  return p;
}

/** Normalize user input to a playlist URL yt-dlp accepts (raw list id → URL). m3u8 URLs pass through. */
export function isPlaylistInput(text: string): boolean {
  const s = text.trim();
  if (isM3u8Source(s)) return true;
  if (/^https?:\/\/(www\.)?youtube\.com\/playlist\?/i.test(s)) return true;
  return /^[a-zA-Z0-9_-]{12,50}$/.test(s);
}

export function normalizePlaylist(text: string): string {
  const s = text.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://www.youtube.com/playlist?list=${s}`;
}
