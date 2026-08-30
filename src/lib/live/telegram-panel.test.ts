import { describe, expect, it } from "vitest";
import {
  parseLiveCallback,
  cb,
  formatSessionStatus,
  mainMenuKeyboard,
  channelPickKeyboard,
  confirmStartKeyboard,
  formatSchedules,
  schedulesKeyboard,
  formatChannels,
  channelsKeyboard,
  formatSettings,
  settingsKeyboard,
  NEXT_POSITION,
  type PublicSession,
} from "./telegram-panel";

const IDLE: PublicSession = { state: "idle", isActive: false, queue: [], currentIndex: -1, currentElapsedSec: 0 };
const LIVE: PublicSession = {
  state: "live",
  isActive: true,
  quality: "720",
  queue: [
    { videoId: "a", title: "First <Video>", durationSec: 90, status: "done" },
    { videoId: "b", title: "Second", durationSec: null, status: "playing" },
  ],
  currentIndex: 1,
  currentElapsedSec: 65,
};

describe("live telegram callbacks", () => {
  it("parses live:… callback payloads", () => {
    expect(parseLiveCallback("live:menu")).toEqual({ action: "menu", arg: "" });
    expect(parseLiveCallback("live:pick_channel:LCH-1")).toEqual({ action: "pick_channel", arg: "LCH-1" });
    expect(parseLiveCallback("approve:CNT-1")).toBeNull();
    expect(parseLiveCallback("live")).toBeNull();
  });
});

describe("session status rendering", () => {
  it("renders idle and active sessions", () => {
    expect(formatSessionStatus(null)).toContain("فعالی وجود ندارد");
    const active = formatSessionStatus(LIVE);
    expect(active).toContain("🔴 زنده");
    expect(active).toContain("Second");
    expect(active).toContain("1:05");
    expect(active).toContain("2 از 2");
    expect(formatSessionStatus(IDLE)).toContain("فعالی وجود ندارد");
  });

  it("escapes html in titles", () => {
    const s: PublicSession = { ...LIVE, currentIndex: 0 };
    expect(formatSessionStatus(s)).not.toContain("<Video>");
    expect(formatSessionStatus(s)).toContain("&lt;Video&gt;");
  });
});

describe("keyboards", () => {
  it("main menu switches by active state", () => {
    const idle = mainMenuKeyboard(IDLE);
    expect(idle.flat().map((b) => b.text)).toContain("▶️ شروع لایو");
    const live = mainMenuKeyboard(LIVE);
    const texts = live.flat().map((b) => b.text);
    expect(texts).toContain("⏭ رد کردن");
    expect(texts).toContain("⏹ توقف");
    expect(texts).not.toContain("▶️ شروع لایو");
  });

  it("channel picker lists channels with back button", () => {
    const kb = channelPickKeyboard([{ id: "1", name: "Main" }]);
    expect(kb[0][0]).toEqual({ text: "Main", callback_data: "live:pick_channel:1" });
    expect(kb[kb.length - 1][0].text).toBe("◀️ بازگشت");
  });

  it("confirm start keyboard encodes args", () => {
    const kb = confirmStartKeyboard("LCH-1", "https://youtube.com/playlist?list=PL1", "720", true);
    expect(kb[0][0].callback_data.startsWith("live:go:")).toBe(true);
    expect(kb[1][0].text).toContain("720");
    expect(kb[1][1].text).toContain("روشن");
  });

  it("settings keyboard cycles positions", () => {
    expect(NEXT_POSITION["top-left"]).toBe("top-right");
    const kb = settingsKeyboard({ logoPath: "/x.png", position: "top-right", opacity: 0.8 });
    expect(kb[0][0].text).toContain("بالا راست");
    expect(kb[2][0].callback_data).toBe("live:clear_logo");
    expect(formatSettings({ logoPath: "", position: "top-right", opacity: 0.8 })).toContain("تنظیم نشده");
  });
});

describe("schedules and channels views", () => {
  const rows = [
    { id: "LSC-1", name: "Evening", startTehran: "18:00", endTehran: "22:00", daysOfWeek: [0, 6], enabled: true, channelName: "Main" },
    { id: "LSC-2", name: "Daily", startTehran: "09:00", endTehran: null, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], enabled: false, channelName: "Main" },
  ];

  it("renders schedules with day labels and toggle buttons", () => {
    const text = formatSchedules(rows);
    expect(text).toContain("18:00–22:00");
    expect(text).toContain("هر روز");
    const kb = schedulesKeyboard(rows);
    expect(kb[0][0].callback_data).toBe("live:sched_toggle:LSC-1");
    expect(kb[1][0].callback_data).toBe("live:sched_toggle:LSC-2");
    expect(kb[0][1].callback_data).toBe("live:sched_delete:LSC-1");
  });

  it("renders empty schedules", () => {
    expect(formatSchedules([])).toContain("ثبت نشده");
  });

  it("renders channels with masked-safe urls and toggles", () => {
    const rows = [{ id: "LCH-1", name: "Main", rtmpUrl: "rtmp://a/live2", isActive: true }];
    const text = formatChannels(rows);
    expect(text).toContain("rtmp://a/live2");
    const kb = channelsKeyboard(rows);
    expect(kb[0][0].callback_data).toBe("live:chan_toggle:LCH-1");
    expect(formatChannels([])).toContain("ذخیره نشده");
  });
});
