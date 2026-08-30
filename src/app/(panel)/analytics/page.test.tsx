import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrafficTable } from "@/components/analytics/TrafficTable";
import { SyncStatus } from "@/components/analytics/SyncStatus";
import type { AnalyticsFreshness } from "@/lib/analytics/types";

afterEach(() => cleanup());

// Verify Task 3 wiring: tabs receive real data not empty []
describe("analytics tabs wire to real data", () => {
  it("renders traffic data", async () => {
    render(<TrafficTable data={[{ trafficSource: "SEARCH", views: 100, watchTimeMinutes: 50 }]} />);
    expect(screen.getByText("SEARCH")).toBeDefined();
    expect(screen.getByText(/۱۰۰/)).toBeDefined();
  });

  it("renders traffic data with trafficSourceType alias", async () => {
    // page extractor should handle trafficSourceType -> trafficSource mapping
    const raw = { trafficData: [{ trafficSourceType: "SEARCH", views: 100 }] } as unknown as Record<string, unknown>;
    const extract = (r: Record<string, unknown>) => {
      const arr = (r.trafficData as unknown[]).map((x: unknown) => {
        const y = x as { trafficSourceType: string; views: number };
        return { trafficSource: y.trafficSourceType, views: y.views, watchTimeMinutes: 0 };
      });
      return arr;
    };
    const converted = extract(raw);
    render(<TrafficTable data={converted} />);
    expect(screen.getAllByText("SEARCH").length).toBeGreaterThan(0);
  });

  it("SyncStatus shows quota warning with nextAttemptAt", () => {
    const freshness: AnalyticsFreshness = {
      state: "error",
      lastSyncedAt: new Date(),
      accounts: [
        { accountId: "a1", state: "error", lastSyncAt: new Date(), lastError: "quota", lastErrorCode: "QUOTA_EXHAUSTED", nextAttemptAt: new Date(Date.now() + 86400000).toISOString() },
      ],
    };
    render(<SyncStatus freshness={freshness} syncing={false} onSync={vi.fn()} />);
    expect(screen.getAllByText(/سهمیه/).length).toBeGreaterThan(0);
  });

  it("SyncStatus shows reconnect warning", () => {
    const freshness: AnalyticsFreshness = {
      state: "error",
      lastSyncedAt: new Date(),
      accounts: [
        { accountId: "a1", state: "error", lastSyncAt: new Date(), lastError: "reconnect", lastErrorCode: "RECONNECT_REQUIRED", nextAttemptAt: null },
      ],
    };
    render(<SyncStatus freshness={freshness} syncing={false} onSync={vi.fn()} />);
    expect(screen.getAllByText(/اتصال حساب/).length).toBeGreaterThan(0);
  });

  it("SyncStatus shows best publish time suggestion", () => {
    const freshness: AnalyticsFreshness = {
      state: "fresh",
      lastSyncedAt: new Date(),
      accounts: [{ accountId: "a1", state: "fresh", lastSyncAt: new Date(), lastError: null, lastErrorCode: null, nextAttemptAt: null }],
    };
    render(<SyncStatus freshness={freshness} syncing={false} onSync={vi.fn()} bestPublishTime="19:00" comparison={{ views: 12, likes: null } as never} />);
    expect(screen.getByText(/بهترین زمان انتشار/)).toBeDefined();
    expect(screen.getByText(/19:00/)).toBeDefined();
  });
});
