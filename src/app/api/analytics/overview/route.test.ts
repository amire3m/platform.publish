import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-helpers", () => ({
  requirePermission: vi.fn(),
  jsonError: (message: string, status = 400, code?: string) =>
    Response.json({ ok: false, error: message, code }, { status }),
  jsonOk: (data: unknown) => Response.json({ ok: true, data }),
}));

import { AnalyticsAccessError } from "@/lib/analytics/queries";
import {
  buildLegacyDashboardFields,
  handleAnalyticsOverviewRequest,
} from "@/app/api/analytics/overview/route";

const user = {
  id: "user-1",
  telegramId: "telegram-1",
  role: "analyst",
  allowedActions: ["view_analytics"],
  allowedAccountIds: ["account-1"],
};

function dependencies() {
  return {
    requirePermission: vi.fn().mockResolvedValue({ user, response: null }),
    getOverview: vi.fn().mockResolvedValue({
      scope: "overview",
      hasSnapshotData: false,
      accounts: [],
      topVideos: [],
      subscribersTotal: null,
      comparison: {
        current: { views: 0, likes: 0, comments: 0, shares: 0 },
      },
    }),
    getLegacyDashboardFields: vi.fn().mockResolvedValue({
      totals: { channels: 0, pages: 0, followers: 0, views: 0, engagement: 0 },
      statusCounts: {},
      failedContents: [],
      pendingApproval: [],
      upcoming: [],
      hasAnalyticsData: false,
      syncStatus: null,
    }),
  };
}

describe("GET /api/analytics/overview", () => {
  it("requires view_analytics before reading analytics", async () => {
    const deps = dependencies();
    const denied = Response.json({ ok: false }, { status: 403 });
    deps.requirePermission.mockResolvedValue({ user: null, response: denied });

    const response = await handleAnalyticsOverviewRequest(
      new Request("http://localhost/api/analytics/overview"),
      deps,
    );

    expect(response.status).toBe(403);
    expect(deps.requirePermission).toHaveBeenCalledWith("view_analytics");
    expect(deps.getOverview).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid range without querying", async () => {
    const deps = dependencies();

    const response = await handleAnalyticsOverviewRequest(
      new Request("http://localhost/api/analytics/overview?range=14"),
      deps,
    );

    expect(response.status).toBe(422);
    expect(deps.getOverview).not.toHaveBeenCalled();
  });

  it("passes account scope and allowed IDs to the query and retains dashboard fields", async () => {
    const deps = dependencies();

    const response = await handleAnalyticsOverviewRequest(
      new Request("http://localhost/api/analytics/overview?range=30&accountId=account-1"),
      deps,
    );
    const body = await response.json();

    expect(deps.getOverview).toHaveBeenCalledWith({
      range: 30,
      accountId: "account-1",
      allowedAccountIds: ["account-1"],
    });
    expect(deps.getLegacyDashboardFields).toHaveBeenCalledWith(user, "account-1");
    expect(body.data).toMatchObject({ scope: "overview", statusCounts: {}, hasAnalyticsData: false });
  });

  it("uses snapshot presence for the compatibility data flag even when metrics are zero", async () => {
    const deps = dependencies();
    deps.getOverview.mockResolvedValue({
      ...await deps.getOverview(),
      hasSnapshotData: true,
    });

    const response = await handleAnalyticsOverviewRequest(
      new Request("http://localhost/api/analytics/overview?range=7"),
      deps,
    );
    const body = await response.json();

    expect(body.data.hasAnalyticsData).toBe(true);
  });

  it("maps direct account access denial to 403", async () => {
    const deps = dependencies();
    deps.getOverview.mockRejectedValue(new AnalyticsAccessError());

    const response = await handleAnalyticsOverviewRequest(
      new Request("http://localhost/api/analytics/overview?accountId=account-2"),
      deps,
    );

    expect(response.status).toBe(403);
    expect(deps.getLegacyDashboardFields).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...user, allowedAccountIds: [] }, "empty account scope"],
    [{ ...user, role: "owner", allowedAccountIds: ["account-1"] }, "owner role"],
  ])("normalizes %s to unrestricted query scope", async (unrestrictedUser) => {
    const deps = dependencies();
    deps.requirePermission.mockResolvedValue({ user: unrestrictedUser, response: null });

    await handleAnalyticsOverviewRequest(
      new Request("http://localhost/api/analytics/overview"),
      deps,
    );

    expect(deps.getOverview).toHaveBeenCalledWith({
      range: 90,
      accountId: undefined,
      allowedAccountIds: null,
    });
  });

  it("filters all compatibility content aggregates before exposing titles, errors, or schedules", () => {
    const scheduled = (id: string, title: string, accountId: string, scheduledAtUtc: string) => ({
      id,
      title,
      status: "scheduled",
      error: null,
      scheduledAtUtc: new Date(scheduledAtUtc),
      platformTargets: [{ platform: "youtube", account_id: accountId }],
    });
    const fields = buildLegacyDashboardFields({
      user,
      syncStatus: null,
      accounts: [
        { id: "account-1", platform: "youtube" },
        { id: "account-2", platform: "youtube" },
      ],
      contents: [
        {
          id: "allowed-failed",
          title: "authorized failure",
          status: "failed",
          error: "authorized error",
          scheduledAtUtc: null,
          platformTargets: [{ platform: "youtube", account_id: "account-1" }],
        },
        {
          id: "secret-failed",
          title: "unauthorized failure",
          status: "failed",
          error: "unauthorized error",
          scheduledAtUtc: null,
          platformTargets: [{ platform: "youtube", account_id: "account-2" }],
        },
        {
          id: "allowed-review",
          title: "authorized review",
          status: "in_review",
          error: null,
          scheduledAtUtc: null,
          platformTargets: [{ platform: "youtube", account_id: "account-1" }],
        },
        {
          id: "secret-review",
          title: "unauthorized review",
          status: "in_review",
          error: null,
          scheduledAtUtc: null,
          platformTargets: [{ platform: "youtube", account_id: "account-2" }],
        },
        scheduled("allowed-scheduled", "authorized schedule", "account-1", "2026-08-22T08:00:00.000Z"),
        scheduled("secret-scheduled", "unauthorized schedule", "account-2", "2026-08-21T08:00:00.000Z"),
        {
          id: "targetless",
          title: "targetless secret",
          status: "failed",
          error: "targetless error",
          scheduledAtUtc: null,
          platformTargets: [],
        },
      ],
    });

    expect(fields.statusCounts).toEqual({ failed: 1, in_review: 1, scheduled: 1 });
    expect(fields.failedContents.map((item) => item.title)).toEqual(["authorized failure"]);
    expect(fields.pendingApproval.map((item) => item.title)).toEqual(["authorized review"]);
    expect(fields.upcoming.map((item) => item.title)).toEqual(["authorized schedule"]);
    expect(JSON.stringify(fields)).not.toContain("unauthorized");
    expect(JSON.stringify(fields)).not.toContain("targetless");
  });

  it("removes inaccessible targets and publication results from retained mixed-target rows", () => {
    const fields = buildLegacyDashboardFields({
      user,
      syncStatus: null,
      accounts: [
        { id: "account-1", platform: "youtube" },
        { id: "forbidden-account", platform: "youtube" },
      ],
      contents: [{
        id: "mixed",
        title: "mixed content",
        status: "failed",
        error: "row error",
        scheduledAtUtc: null,
        platformTargets: [
          {
            platform: "youtube",
            account_id: "account-1",
            status: "allowed-status",
            lastError: "allowed-error",
          },
          {
            platform: "youtube",
            account_id: "forbidden-account",
            status: "forbidden-status",
            lastError: "forbidden-error",
          },
        ],
        publishResults: [
          { accountId: "account-1", status: "allowed-result" },
          { account_id: "forbidden-account", status: "forbidden-result", error: "result-secret" },
        ],
      }],
    });

    expect(fields.failedContents).toHaveLength(1);
    expect(fields.failedContents[0].platformTargets).toEqual([{
      platform: "youtube",
      account_id: "account-1",
      status: "allowed-status",
      lastError: "allowed-error",
    }]);
    expect(fields.failedContents[0].publishResults).toEqual([
      { account_id: "account-1", status: "allowed-result" },
    ]);
    const serialized = JSON.stringify(fields);
    expect(serialized).not.toContain("forbidden-account");
    expect(serialized).not.toContain("forbidden-status");
    expect(serialized).not.toContain("forbidden-error");
    expect(serialized).not.toContain("forbidden-result");
    expect(serialized).not.toContain("result-secret");
  });

  it("applies requested account scope to totals and every compatibility content collection", () => {
    const contentRow = (id: string, title: string, status: string, accountId: string) => ({
      id,
      title,
      status,
      error: status === "failed" ? `${title} error` : null,
      scheduledAtUtc: status === "scheduled" ? new Date("2026-08-22T08:00:00.000Z") : null,
      platformTargets: [{ platform: "instagram", account_id: accountId, status: `${title} target` }],
      publishResults: [{ accountId, status: `${title} result` }],
    });
    const fields = buildLegacyDashboardFields({
      user: { ...user, allowedAccountIds: ["account-1", "account-2"] },
      requestedAccountId: "account-2",
      syncStatus: null,
      accounts: [
        { id: "account-1", platform: "youtube" },
        { id: "account-2", platform: "instagram" },
      ],
      contents: [
        contentRow("failed-1", "account one failed", "failed", "account-1"),
        contentRow("failed-2", "account two failed", "failed", "account-2"),
        contentRow("review-1", "account one review", "in_review", "account-1"),
        contentRow("review-2", "account two review", "in_review", "account-2"),
        contentRow("scheduled-1", "account one scheduled", "scheduled", "account-1"),
        contentRow("scheduled-2", "account two scheduled", "scheduled", "account-2"),
      ],
    });

    expect(fields.totals).toMatchObject({ channels: 0, pages: 1 });
    expect(fields.statusCounts).toEqual({ failed: 1, in_review: 1, scheduled: 1 });
    expect(fields.failedContents.map((item) => item.title)).toEqual(["account two failed"]);
    expect(fields.pendingApproval.map((item) => item.title)).toEqual(["account two review"]);
    expect(fields.upcoming.map((item) => item.title)).toEqual(["account two scheduled"]);
    expect(JSON.stringify(fields)).not.toContain("account one");
    expect(fields.failedContents[0].platformTargets).toHaveLength(1);
    expect(fields.failedContents[0].publishResults).toHaveLength(1);
  });

  it("rejects conflicting account aliases and canonicalizes every retained target and result", () => {
    const originalTarget = {
      platform: "youtube",
      accountId: "account-1",
      status: "single-alias-target",
    };
    const originalResult = {
      accountId: "account-1",
      status: "single-alias-result",
    };
    const fields = buildLegacyDashboardFields({
      user,
      syncStatus: null,
      accounts: [{ id: "account-1", platform: "youtube" }],
      contents: [{
        id: "alias-content",
        title: "alias content",
        status: "failed",
        error: null,
        scheduledAtUtc: null,
        platformTargets: [
          originalTarget,
          {
            platform: "youtube",
            account_id: "account-1",
            accountId: "forbidden-account",
            status: "conflicting-target-status",
            lastError: "conflicting-target-error",
          },
          {
            platform: "youtube",
            account_id: "account-1",
            accountId: "account-1",
            status: "same-alias-target",
          },
        ],
        publishResults: [
          originalResult,
          {
            account_id: "account-1",
            accountId: "forbidden-account",
            status: "conflicting-result-status",
            error: "conflicting-result-error",
          },
          {
            account_id: "account-1",
            accountId: "account-1",
            status: "same-alias-result",
          },
        ],
      }],
    });

    const retained = fields.failedContents[0];
    expect(retained.platformTargets).toEqual([
      { platform: "youtube", status: "single-alias-target", account_id: "account-1" },
      { platform: "youtube", status: "same-alias-target", account_id: "account-1" },
    ]);
    expect(retained.publishResults).toEqual([
      { status: "single-alias-result", account_id: "account-1" },
      { status: "same-alias-result", account_id: "account-1" },
    ]);
    expect(retained.platformTargets[0]).not.toBe(originalTarget);
    expect((retained.publishResults as unknown[])[0]).not.toBe(originalResult);
    for (const record of [...retained.platformTargets, ...(retained.publishResults as Record<string, unknown>[])]) {
      expect(record).toHaveProperty("account_id", "account-1");
      expect(record).not.toHaveProperty("accountId");
    }
    const serialized = JSON.stringify(fields);
    expect(serialized).not.toContain("forbidden-account");
    expect(serialized).not.toContain("conflicting-target-status");
    expect(serialized).not.toContain("conflicting-target-error");
    expect(serialized).not.toContain("conflicting-result-status");
    expect(serialized).not.toContain("conflicting-result-error");
  });
});
