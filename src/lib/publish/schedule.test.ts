import { describe, expect, it } from "vitest";

import {
  checkPublishGate,
  inPublishWindow,
  jitterDelayMs,
  nextTehranMidnight,
  normalizeScheduleSettings,
  tehranDayKey,
  tehranHHMM,
  type PublishScheduleSettings,
  type PublishUsage,
} from "./schedule";

const SETTINGS: PublishScheduleSettings = {
  dailyCap: null,
  cooldownMin: null,
  windowStart: null,
  windowEnd: null,
  jitterMin: 0,
  instantPost: false,
};

const USAGE: PublishUsage = { lastPublishedAt: null, day: null, count: 0 };

describe("tehran clock", () => {
  it("maps instants to Tehran day and HH:MM", () => {
    // 2026-09-21T20:30Z = 2026-09-22 00:00 in Tehran (+3:30)
    const d = new Date("2026-09-21T20:30:00.000Z");
    expect(tehranDayKey(d)).toBe("2026-09-22");
    expect(tehranHHMM(d)).toBe("00:00");
    expect(tehranHHMM(new Date("2026-09-21T10:00:00.000Z"))).toBe("13:30");
  });

  it("computes the next Tehran midnight", () => {
    const at = new Date("2026-09-21T10:00:00.000Z"); // 13:30 Tehran
    const midnight = nextTehranMidnight(at);
    expect(midnight.toISOString()).toBe("2026-09-21T20:30:00.000Z");
    expect(midnight.getTime()).toBeGreaterThan(at.getTime());
  });
});

describe("inPublishWindow", () => {
  it("passes without a window", () => {
    expect(inPublishWindow(new Date(), null, null)).toBe(true);
    expect(inPublishWindow(new Date(), "09:00", null)).toBe(true);
  });

  it("enforces a daytime window", () => {
    const inside = new Date("2026-09-21T10:00:00.000Z"); // 13:30 Tehran
    expect(inPublishWindow(inside, "09:00", "23:00")).toBe(true);
    expect(inPublishWindow(inside, "14:00", "23:00")).toBe(false);
  });

  it("supports overnight wraps", () => {
    const night = new Date("2026-09-21T20:00:00.000Z"); // 23:30 Tehran
    const morning = new Date("2026-09-21T02:00:00.000Z"); // 05:30 Tehran
    const noon = new Date("2026-09-21T10:00:00.000Z"); // 13:30 Tehran
    expect(inPublishWindow(night, "22:00", "06:00")).toBe(true);
    expect(inPublishWindow(morning, "22:00", "06:00")).toBe(true);
    expect(inPublishWindow(noon, "22:00", "06:00")).toBe(false);
  });

  it("rejects malformed bounds", () => {
    expect(inPublishWindow(new Date(), "25:00", "06:00")).toBe(true);
  });
});

describe("jitterDelayMs", () => {
  it("stays within 0..N minutes", () => {
    expect(jitterDelayMs(0)).toBe(0);
    expect(jitterDelayMs(10, () => 0)).toBe(0);
    expect(jitterDelayMs(10, () => 0.9999)).toBeLessThan(10 * 60 * 1000);
    expect(jitterDelayMs(10, () => 0.5)).toBe(5 * 60 * 1000);
  });
});

describe("checkPublishGate", () => {
  it("passes with no limits", () => {
    expect(checkPublishGate(new Date(), SETTINGS, USAGE)).toEqual({ ok: true });
  });

  it("blocks outside the window", () => {
    const at = new Date("2026-09-21T10:00:00.000Z"); // 13:30 Tehran
    const out = checkPublishGate(at, { ...SETTINGS, windowStart: "14:00", windowEnd: "23:00" }, USAGE);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("window");
  });

  it("enforces the daily cap and resets on a new Tehran day", () => {
    const at = new Date("2026-09-21T10:00:00.000Z"); // Tehran 2026-09-21 13:30
    const settings = { ...SETTINGS, dailyCap: 2 };
    const full = checkPublishGate(at, settings, { lastPublishedAt: null, day: "2026-09-21", count: 2 });
    expect(full.ok).toBe(false);
    if (!full.ok) {
      expect(full.reason).toBe("cap");
      expect(full.retryAfterMs).toBeGreaterThan(0);
    }
    expect(checkPublishGate(at, settings, { lastPublishedAt: null, day: "2026-09-20", count: 9 }).ok).toBe(true);
    expect(checkPublishGate(at, settings, { lastPublishedAt: null, day: "2026-09-21", count: 1 }).ok).toBe(true);
  });

  it("enforces cooldown between publishes", () => {
    const at = new Date("2026-09-21T10:00:00.000Z");
    const settings = { ...SETTINGS, cooldownMin: 60 };
    const recent = new Date(at.getTime() - 10 * 60 * 1000).toISOString();
    const blocked = checkPublishGate(at, settings, { lastPublishedAt: recent, day: "2026-09-21", count: 1 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe("cooldown");
      expect(blocked.retryAfterMs).toBeCloseTo(50 * 60 * 1000, -3);
    }
    const old = new Date(at.getTime() - 61 * 60 * 1000).toISOString();
    expect(checkPublishGate(at, settings, { lastPublishedAt: old, day: "2026-09-21", count: 1 }).ok).toBe(true);
  });
});

describe("normalizeScheduleSettings", () => {
  it("reads camelCase and snake_case rows and sanitizes garbage", () => {
    expect(normalizeScheduleSettings({})).toEqual({
      dailyCap: null, cooldownMin: null, windowStart: null, windowEnd: null, jitterMin: 0, instantPost: false,
    });
    expect(
      normalizeScheduleSettings({
        publish_daily_cap: 3, publish_cooldown_min: "45", publish_window_start: "09:00",
        publish_window_end: "23:30", publish_jitter_min: 10, instant_post: true,
      }),
    ).toEqual({
      dailyCap: 3, cooldownMin: 45, windowStart: "09:00", windowEnd: "23:30", jitterMin: 10, instantPost: true,
    });
    const bad = normalizeScheduleSettings({ publishDailyCap: -2, publishWindowStart: "99:99", publishJitterMin: "x" });
    expect(bad.dailyCap).toBe(0);
    expect(bad.windowStart).toBeNull();
    expect(bad.jitterMin).toBe(0);
  });
});
