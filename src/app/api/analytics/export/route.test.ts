import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-helpers", () => ({
  requirePermission: vi.fn(),
  jsonError: (message: string, status = 400, code?: string) =>
    Response.json({ ok: false, error: message, code }, { status }),
}));

import { handleAnalyticsExportRequest } from "@/app/api/analytics/export/route";

const user = {
  id: "user-1",
  role: "analyst",
  allowedActions: ["view_analytics", "export_data"],
  allowedAccountIds: ["account-1"],
};

function dependencies() {
  return {
    requirePermission: vi.fn().mockResolvedValue({ user, response: null }),
    getExportRows: vi.fn().mockResolvedValue([]),
    listReportingAccountIds: vi.fn().mockResolvedValue(["account-1"]),
    encodeCsv: vi.fn().mockReturnValue("\uFEFFتاریخ\r\n"),
    now: () => new Date("2026-08-21T12:00:00.000Z"),
  };
}

describe("GET /api/analytics/export", () => {
  it("requires view_analytics and export_data before exporting", async () => {
    const deps = dependencies();

    await handleAnalyticsExportRequest(
      new Request("http://localhost/api/analytics/export"),
      deps,
    );

    expect(deps.requirePermission.mock.calls.map(([permission]) => permission))
      .toEqual(["view_analytics", "export_data"]);
  });

  it("stops when either permission is denied", async () => {
    const deps = dependencies();
    const denied = Response.json({ ok: false }, { status: 403 });
    deps.requirePermission
      .mockResolvedValueOnce({ user, response: null })
      .mockResolvedValueOnce({ user: null, response: denied });

    const response = await handleAnalyticsExportRequest(
      new Request("http://localhost/api/analytics/export"),
      deps,
    );

    expect(response.status).toBe(403);
    expect(deps.getExportRows).not.toHaveBeenCalled();
  });

  it("validates range and scope with 422", async () => {
    const deps = dependencies();

    const invalidRange = await handleAnalyticsExportRequest(
      new Request("http://localhost/api/analytics/export?range=14"),
      deps,
    );
    const invalidScope = await handleAnalyticsExportRequest(
      new Request("http://localhost/api/analytics/export?scope=all"),
      deps,
    );

    expect(invalidRange.status).toBe(422);
    expect(invalidScope.status).toBe(422);
    expect(deps.getExportRows).not.toHaveBeenCalled();
  });

  it("exports the exact current filter with a safe deterministic filename", async () => {
    const deps = dependencies();

    const response = await handleAnalyticsExportRequest(
      new Request("http://localhost/api/analytics/export?range=7&scope=content&accountId=account-1&contentId=video-1"),
      deps,
    );

    expect(deps.getExportRows).toHaveBeenCalledWith({
      scope: "content",
      range: 7,
      accountId: "account-1",
      contentId: "video-1",
      startDate: new Date("2026-08-13T20:30:00.000Z"),
      endDate: new Date("2026-08-20T20:30:00.000Z"),
      allowedAccountIds: ["account-1"],
    });
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition"))
      .toBe('attachment; filename="youtube-analytics-7d-2026-08-21.csv"');
  });

  it("limits a real empty-list user to Emro reporting accounts", async () => {
    const deps = dependencies();
    const emptyListUser = { ...user, allowedAccountIds: [] };
    deps.requirePermission.mockResolvedValue({ user: emptyListUser, response: null });

    await handleAnalyticsExportRequest(
      new Request("http://localhost/api/analytics/export?range=7"),
      deps,
    );

    expect(deps.getExportRows.mock.calls[0][0].allowedAccountIds).toEqual(["account-1"]);
  });
});
