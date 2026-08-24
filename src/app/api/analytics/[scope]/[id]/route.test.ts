import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-helpers", () => ({
  requirePermission: vi.fn(),
  jsonError: (message: string, status = 400, code?: string) =>
    Response.json({ ok: false, error: message, code }, { status }),
  jsonOk: (data: unknown) => Response.json({ ok: true, data }),
}));

import { handleAnalyticsDetailRequest } from "@/app/api/analytics/[scope]/[id]/route";

const user = {
  id: "user-1",
  role: "analyst",
  allowedActions: ["view_analytics"],
  allowedAccountIds: ["account-1"],
};

function dependencies() {
  return {
    requirePermission: vi.fn().mockResolvedValue({ user, response: null }),
    getContent: vi.fn().mockResolvedValue({ scope: "content", videoId: "video-1" }),
    getExportRows: vi.fn().mockResolvedValue([{ accountId: "account-1" }]),
    listReportingAccountIds: vi.fn().mockResolvedValue(["account-1"]),
    now: () => new Date("2026-08-21T12:00:00.000Z"),
  };
}

describe("GET /api/analytics/:scope/:id", () => {
  it("returns 404 for both missing and inaccessible content IDs", async () => {
    const deps = dependencies();
    deps.getContent.mockResolvedValue(null);

    const response = await handleAnalyticsDetailRequest(
      new Request("http://localhost/api/analytics/content/hidden?range=7"),
      { scope: "content", id: "hidden" },
      deps,
    );

    expect(response.status).toBe(404);
    expect(deps.getContent).toHaveBeenCalledWith({
      externalVideoId: "hidden",
      range: 7,
      allowedAccountIds: ["account-1"],
    });
  });

  it("returns account-scoped rows from the typed query boundary", async () => {
    const deps = dependencies();

    const response = await handleAnalyticsDetailRequest(
      new Request("http://localhost/api/analytics/account/account-1?range=30"),
      { scope: "account", id: "account-1" },
      deps,
    );

    expect(response.status).toBe(200);
    expect(deps.getExportRows).toHaveBeenCalledWith({
      scope: "account",
      range: 30,
      accountId: "account-1",
      contentId: null,
      startDate: new Date("2026-07-21T20:30:00.000Z"),
      endDate: new Date("2026-08-20T20:30:00.000Z"),
      allowedAccountIds: ["account-1"],
    });
  });

  it("rejects invalid scope and range without invoking queries", async () => {
    const deps = dependencies();

    const invalidScope = await handleAnalyticsDetailRequest(
      new Request("http://localhost/api/analytics/channel/id"),
      { scope: "channel", id: "id" },
      deps,
    );
    const invalidRange = await handleAnalyticsDetailRequest(
      new Request("http://localhost/api/analytics/content/id?range=14"),
      { scope: "content", id: "id" },
      deps,
    );

    expect(invalidScope.status).toBe(422);
    expect(invalidRange.status).toBe(422);
    expect(deps.getContent).not.toHaveBeenCalled();
    expect(deps.getExportRows).not.toHaveBeenCalled();
  });

  it("limits a real empty-list user to Emro content scope", async () => {
    const deps = dependencies();
    deps.requirePermission.mockResolvedValue({
      user: { ...user, allowedAccountIds: [] },
      response: null,
    });

    await handleAnalyticsDetailRequest(
      new Request("http://localhost/api/analytics/content/video-1?range=7"),
      { scope: "content", id: "video-1" },
      deps,
    );

    expect(deps.getContent).toHaveBeenCalledWith({
      externalVideoId: "video-1",
      range: 7,
      allowedAccountIds: ["account-1"],
    });
  });
});
