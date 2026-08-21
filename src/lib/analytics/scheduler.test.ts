import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  createAnalyticsScheduler,
  type AnalyticsSchedulerDependencies,
} from "@/lib/analytics/scheduler";
import type { AccountSyncResult } from "@/lib/analytics/sync";

function dependencies(
  results: AccountSyncResult[] = [],
): AnalyticsSchedulerDependencies {
  return {
    claimDailyRun: vi.fn().mockResolvedValue(true),
    listSyncableAccountIds: vi.fn().mockResolvedValue(["account-1", "account-2"]),
    syncAccounts: vi.fn().mockResolvedValue(results),
  };
}

describe("createAnalyticsScheduler", () => {
  it("claims the Tehran day before syncing every syncable account once and preserves failures", async () => {
    const now = new Date("2026-08-21T10:15:00.000Z");
    const results: AccountSyncResult[] = [
      { accountId: "account-1", status: "synced", snapshotCount: 3 },
      {
        accountId: "account-2",
        status: "failed",
        code: "QUOTA_EXHAUSTED",
        snapshotCount: 0,
        message: "quota",
      },
    ];
    const deps = dependencies(results);

    await expect(createAnalyticsScheduler(deps).run(now)).resolves.toEqual({
      ran: true,
      results,
    });

    expect(deps.claimDailyRun).toHaveBeenCalledWith(
      now,
      new Date("2026-08-20T20:30:00.000Z"),
    );
    expect(deps.listSyncableAccountIds).toHaveBeenCalledTimes(1);
    expect(deps.syncAccounts).toHaveBeenCalledWith(
      ["account-1", "account-2"],
      { now },
    );
  });

  it("skips listing and syncing when another caller already claimed the day", async () => {
    const deps = dependencies();
    vi.mocked(deps.claimDailyRun).mockResolvedValue(false);

    await expect(createAnalyticsScheduler(deps).run()).resolves.toEqual({
      ran: false,
      results: [],
    });

    expect(deps.listSyncableAccountIds).not.toHaveBeenCalled();
    expect(deps.syncAccounts).not.toHaveBeenCalled();
  });

  it("runs only once on the same Tehran day and runs again the next day", async () => {
    const claimedDays = new Set<number>();
    const deps = dependencies();
    vi.mocked(deps.claimDailyRun).mockImplementation(async (_now, dayStart) => {
      const day = dayStart.getTime();
      if (claimedDays.has(day)) return false;
      claimedDays.add(day);
      return true;
    });
    const scheduler = createAnalyticsScheduler(deps);

    await expect(scheduler.run(new Date("2026-08-21T10:00:00.000Z")))
      .resolves.toMatchObject({ ran: true });
    await expect(scheduler.run(new Date("2026-08-21T18:00:00.000Z")))
      .resolves.toEqual({ ran: false, results: [] });
    await expect(scheduler.run(new Date("2026-08-21T21:00:00.000Z")))
      .resolves.toMatchObject({ ran: true });

    expect(deps.listSyncableAccountIds).toHaveBeenCalledTimes(2);
    expect(deps.syncAccounts).toHaveBeenCalledTimes(2);
  });

  it("treats an empty account list as a completed daily run", async () => {
    const deps = dependencies();
    vi.mocked(deps.listSyncableAccountIds).mockResolvedValue([]);

    await expect(createAnalyticsScheduler(deps).run()).resolves.toEqual({
      ran: true,
      results: [],
    });

    expect(deps.syncAccounts).toHaveBeenCalledWith([], { now: expect.any(Date) });
  });

  it("uses historical Tehran offsets across the 2022 DST transition", async () => {
    const deps = dependencies();
    const scheduler = createAnalyticsScheduler(deps);

    await scheduler.run(new Date("2022-09-21T12:00:00.000Z"));
    await scheduler.run(new Date("2022-09-22T12:00:00.000Z"));

    expect(vi.mocked(deps.claimDailyRun).mock.calls.map(([, start]) => start.toISOString()))
      .toEqual([
        "2022-09-20T19:30:00.000Z",
        "2022-09-21T20:30:00.000Z",
      ]);
  });

  it("does not release the daily claim when syncing throws", async () => {
    let claimedDay: number | undefined;
    const deps = dependencies();
    vi.mocked(deps.claimDailyRun).mockImplementation(async (_now, dayStart) => {
      const day = dayStart.getTime();
      if (claimedDay === day) return false;
      claimedDay = day;
      return true;
    });
    vi.mocked(deps.syncAccounts).mockRejectedValue(new Error("unexpected"));
    const scheduler = createAnalyticsScheduler(deps);
    const now = new Date("2026-08-21T10:15:00.000Z");

    await expect(scheduler.run(now)).rejects.toThrow("unexpected");
    await expect(scheduler.run(now)).resolves.toEqual({ ran: false, results: [] });
  });
});
