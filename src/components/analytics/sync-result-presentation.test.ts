import { describe, expect, it } from "vitest";
import { syncResultPresentation } from "./sync-result-presentation";

describe("syncResultPresentation", () => {
  it.each([
    ["RECONNECT_REQUIRED", "اتصال دوباره لازم است", "اتصال حساب را از بخش کانال‌ها دوباره برقرار کنید."],
    ["API_NOT_ENABLED", "سرویس آمار فعال نیست", "YouTube Analytics API را برای این حساب فعال کنید."],
    ["QUOTA_EXHAUSTED", "سهمیه سرویس تمام شده", "پس از بازنشانی سهمیه دوباره تلاش کنید."],
    ["SYNC_IN_PROGRESS", "همگام‌سازی در جریان است", "چند دقیقه دیگر وضعیت را دوباره بررسی کنید."],
  ] as const)("maps %s to an actionable label", (code, label, action) => {
    expect(syncResultPresentation({ status: "failed", code })).toMatchObject({ label, action });
  });

  it("labels successful and unclassified results", () => {
    expect(syncResultPresentation({ status: "synced" }).label).toBe("همگام شد");
    expect(syncResultPresentation({ status: "skipped" }).label).toBe("رد شد");
    expect(syncResultPresentation({ status: "failed", code: "SYNC_FAILED" }).label).toBe("ناموفق");
  });
});
