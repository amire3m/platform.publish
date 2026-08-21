import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-helpers", () => ({
  requirePermission: vi.fn(),
  jsonError: (message: string, status = 400, code?: string) =>
    Response.json({ ok: false, error: message, code }, { status }),
  jsonOk: (data: unknown) => Response.json({ ok: true, data }),
}));

import { handleAnalyticsSyncRequest } from "@/app/api/analytics/sync/route";

const restrictedUser = {
  id: "user-1",
  role: "analyst",
  allowedActions: ["view_analytics"],
  allowedAccountIds: ["account-1", "account-2"],
};

interface TestUser {
  id: string;
  role: string;
  allowedActions: string[];
  allowedAccountIds: string[] | null;
}

function dependencies(user: TestUser = restrictedUser) {
  return {
    requirePermission: vi.fn().mockResolvedValue({ user, response: null }),
    listSyncableAccounts: vi.fn().mockResolvedValue([{ id: "account-1" }, { id: "account-2" }]),
    syncAccounts: vi.fn().mockResolvedValue([
      { accountId: "account-1", status: "synced", snapshotCount: 2 },
      { accountId: "account-2", status: "skipped", snapshotCount: 0 },
    ]),
  };
}

describe("POST /api/analytics/sync", () => {
  it("resolves a restricted list through the repository and excludes allowed but unsyncable IDs", async () => {
    const scopedUser = {
      ...restrictedUser,
      allowedAccountIds: ["yt-connected", "instagram", "disconnected", "missing"],
    };
    const deps = dependencies(scopedUser);
    deps.listSyncableAccounts.mockResolvedValue([{ id: "yt-connected" }]);
    deps.syncAccounts.mockResolvedValue([
      { accountId: "yt-connected", status: "synced", snapshotCount: 2 },
    ]);

    const response = await handleAnalyticsSyncRequest(
      new Request("http://localhost/api/analytics/sync", { method: "POST" }),
      deps,
    );
    const body = await response.json();

    expect(deps.listSyncableAccounts).toHaveBeenCalledWith([
      "yt-connected",
      "instagram",
      "disconnected",
      "missing",
    ]);
    expect(deps.syncAccounts).toHaveBeenCalledWith(["yt-connected"]);
    expect(JSON.stringify(deps.syncAccounts.mock.calls)).not.toContain("instagram");
    expect(JSON.stringify(deps.syncAccounts.mock.calls)).not.toContain("disconnected");
    expect(JSON.stringify(deps.syncAccounts.mock.calls)).not.toContain("missing");
    expect(body.data).toMatchObject({ succeeded: 1, failed: 0, skipped: 0 });
  });

  it("denies a specific inaccessible account before syncing", async () => {
    const deps = dependencies();

    const response = await handleAnalyticsSyncRequest(
      new Request("http://localhost/api/analytics/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: "secret" }),
      }),
      deps,
    );

    expect(response.status).toBe(403);
    expect(deps.syncAccounts).not.toHaveBeenCalled();
  });

  it("requires manage_accounts when a real empty-list user requests all accounts", async () => {
    const emptyListUser = { ...restrictedUser, allowedAccountIds: [] };
    const deps = dependencies(emptyListUser);
    const denied = Response.json({ ok: false }, { status: 403 });
    deps.requirePermission
      .mockResolvedValueOnce({ user: emptyListUser, response: null })
      .mockResolvedValueOnce({ user: null, response: denied });

    const response = await handleAnalyticsSyncRequest(
      new Request("http://localhost/api/analytics/sync", { method: "POST" }),
      deps,
    );

    expect(response.status).toBe(403);
    expect(deps.requirePermission.mock.calls.map(([permission]) => permission))
      .toEqual(["view_analytics", "manage_accounts"]);
    expect(deps.listSyncableAccounts).not.toHaveBeenCalled();
  });

  it("lists repository IDs and syncs all after empty-list management approval", async () => {
    const unrestricted = { ...restrictedUser, allowedAccountIds: [] };
    const deps = dependencies(unrestricted);

    await handleAnalyticsSyncRequest(
      new Request("http://localhost/api/analytics/sync", { method: "POST" }),
      deps,
    );

    expect(deps.requirePermission.mock.calls.map(([permission]) => permission))
      .toEqual(["view_analytics", "manage_accounts"]);
    expect(deps.listSyncableAccounts).toHaveBeenCalledWith();
    expect(deps.syncAccounts).toHaveBeenCalledWith(["account-1", "account-2"]);
  });
});
