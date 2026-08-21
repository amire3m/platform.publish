import { describe, expect, it } from "vitest";

import { getDashboardRenderState, getSyncRecoveryState } from "@/lib/analytics/dashboard-state";

describe("dashboard render state", () => {
  it.each([
    [{ hasOverview: false, hasError: false, isLoading: true }, "loading"],
    [{ hasOverview: false, hasError: true, isLoading: false }, "unavailable"],
    [{ hasOverview: true, hasError: true, isLoading: false }, "unavailable"],
    [{ hasOverview: true, hasError: false, isLoading: false }, "ready"],
  ] as const)("maps %o to %s", (input, expected) => {
    expect(getDashboardRenderState(input)).toBe(expected);
  });
});

describe("persisted analytics recovery state", () => {
  it.each([
    ["RECONNECT_REQUIRED", "اتصال حساب یوتیوب را دوباره برقرار کنید."],
    ["API_NOT_ENABLED", "YouTube Analytics API را در پروژه Google فعال کنید."],
  ] as const)("uses actionable %s status after reload", (lastErrorCode, message) => {
    expect(getSyncRecoveryState([{
      lastErrorCode,
      nextAttemptAt: null,
    }], new Date("2026-08-21T12:00:00.000Z"))).toEqual({ message, retryDisabled: false });
  });

  it("disables immediate quota retry until the deterministic next attempt", () => {
    const account = {
      lastErrorCode: "QUOTA_EXHAUSTED",
      nextAttemptAt: new Date("2026-08-21T20:30:00.000Z"),
    };

    expect(getSyncRecoveryState([account], new Date("2026-08-21T12:00:00.000Z"))).toEqual({
      message: "سهمیه تمام شده است؛ زمان نمایش‌داده‌شده، برآورد محافظه‌کارانه تلاش بعدی است.",
      retryDisabled: true,
    });
    expect(getSyncRecoveryState([account], new Date("2026-08-21T20:30:00.000Z")).retryDisabled).toBe(false);
  });
});
