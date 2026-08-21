import { describe, expect, it, vi } from "vitest";
import {
  analyticsFilterKey,
  analyticsFiltersChanged,
  buildAnalyticsSyncRequest,
  createRequestGenerationGuard,
  executeAnalyticsSyncRequest,
} from "./analytics-controls";

describe("analytics sync controls", () => {
  it("blocks an unscoped sync without manage_accounts", () => {
    expect(buildAnalyticsSyncRequest("", ["view_analytics"], [])).toEqual({
      allowed: false,
      body: null,
      reason: "برای همگام‌سازی یک کانال انتخاب کنید",
    });
  });

  it("allows selected-account sync without manage_accounts", () => {
    expect(buildAnalyticsSyncRequest("account-1", ["view_analytics"], [])).toEqual({
      allowed: true,
      body: JSON.stringify({ accountId: "account-1" }),
      reason: null,
    });
  });

  it("allows bulk sync only with manage_accounts", () => {
    expect(buildAnalyticsSyncRequest("", ["view_analytics", "manage_accounts"], null)).toEqual({
      allowed: true,
      body: "",
      reason: null,
    });
  });

  it("allows scoped bulk sync for a non-manager with a non-empty account restriction", () => {
    expect(buildAnalyticsSyncRequest("", ["view_analytics"], ["account-1", "account-2"])).toEqual({
      allowed: true,
      body: "",
      reason: null,
    });
  });

  it("does not invoke the network sender for a programmatic unauthorized bulk request", async () => {
    const send = vi.fn();

    const result = await executeAnalyticsSyncRequest("", ["view_analytics"], [], send);

    expect(result).toEqual({ sent: false, reason: "برای همگام‌سازی یک کانال انتخاب کنید" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the selected-account body through the guarded behavior boundary", async () => {
    const response = { ok: true };
    const send = vi.fn().mockResolvedValue(response);

    const result = await executeAnalyticsSyncRequest("account-1", ["view_analytics"], [], send);

    expect(send).toHaveBeenCalledWith(JSON.stringify({ accountId: "account-1" }));
    expect(result).toEqual({ sent: true, response });
  });
});

describe("sync request generation", () => {
  it("invalidates a captured request after a filter generation change", () => {
    const guard = createRequestGenerationGuard();
    const requestGeneration = guard.capture();

    guard.invalidate();

    expect(guard.isCurrent(requestGeneration)).toBe(false);
    expect(guard.isCurrent(guard.capture())).toBe(true);
  });

  it("creates a deterministic key across account, range, and scope", () => {
    expect(analyticsFilterKey({ accountId: "account-1", range: 30, scope: "content" }))
      .toBe("account-1\u000030\u0000content");
  });
});

describe("analyticsFiltersChanged", () => {
  const current = { accountId: "a", range: 30 as const, scope: "account" as const };

  it.each([
    [{ ...current, accountId: "b" }, "account"],
    [{ ...current, range: 90 as const }, "range"],
    [{ ...current, scope: "content" as const }, "scope"],
  ])("detects a filter change", (next, _dimension) => {
    expect(analyticsFiltersChanged(current, next)).toBe(true);
  });

  it("does not clear results for an identical filter selection", () => {
    expect(analyticsFiltersChanged(current, current)).toBe(false);
  });
});
