import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountSyncResult } from "@/lib/analytics/sync";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  canAccessAccount: vi.fn(),
  syncYouTubeAccount: vi.fn(),
  appendAuditEvent: vi.fn(),
  selectLimit: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.selectLimit }),
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({ socialAccounts: { id: "id" } }));
vi.mock("@/lib/api-helpers", () => ({
  requirePermission: mocks.requirePermission,
  jsonError: (message: string, status = 400, code?: string) =>
    Response.json({ ok: false, error: message, code }, { status }),
  jsonOk: (data: unknown, status = 200) => Response.json({ ok: true, data }, { status }),
}));
vi.mock("@/lib/permissions", () => ({ canAccessAccount: mocks.canAccessAccount }));
vi.mock("@/lib/telegram/tgdb", () => ({ appendAuditEvent: mocks.appendAuditEvent }));
vi.mock("@/lib/analytics/sync", () => ({
  syncYouTubeAccount: mocks.syncYouTubeAccount,
  accountSyncHttpStatus: (syncResult: AccountSyncResult) => {
    if (syncResult.code === "SYNC_IN_PROGRESS") return 409;
    if (syncResult.code === "ACCOUNT_NOT_SYNCABLE") return 422;
    return syncResult.status === "failed" ? 502 : 200;
  },
}));

import { GET, POST } from "@/app/api/accounts/[id]/[action]/route";

const user = {
  id: "user-1",
  telegramId: "telegram-1",
  role: "analyst",
  allowedActions: ["view_analytics"],
  allowedAccountIds: ["account-1"],
};

function context(id = "account-1") {
  return { params: Promise.resolve({ id, action: "sync" }) };
}

function getContext(id = "account-1") {
  return { params: Promise.resolve({ id, action: "capabilities" }) };
}

function result(overrides: Partial<AccountSyncResult> = {}): AccountSyncResult {
  return {
    accountId: "account-1",
    status: "synced",
    snapshotCount: 4,
    range: {
      start: "2026-08-18T20:30:00.000Z",
      end: "2026-08-20T20:30:00.000Z",
    },
    ...overrides,
  };
}

describe("POST /api/accounts/:id/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ user, response: null });
    mocks.canAccessAccount.mockReturnValue(true);
    mocks.syncYouTubeAccount.mockResolvedValue(result());
    mocks.appendAuditEvent.mockResolvedValue(undefined);
  });

  it("requires view_analytics before checking account scope or syncing", async () => {
    const denied = Response.json({ ok: false }, { status: 403 });
    mocks.requirePermission.mockResolvedValue({ user: null, response: denied });

    const response = await POST(new Request("http://localhost"), context());

    expect(response.status).toBe(403);
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_analytics");
    expect(mocks.canAccessAccount).not.toHaveBeenCalled();
    expect(mocks.syncYouTubeAccount).not.toHaveBeenCalled();
  });

  it("denies an inaccessible account before invoking synchronization", async () => {
    mocks.canAccessAccount.mockReturnValue(false);

    const response = await POST(new Request("http://localhost"), context("account-2"));

    expect(response.status).toBe(403);
    expect(mocks.canAccessAccount).toHaveBeenCalledWith(user, "account-2");
    expect(mocks.syncYouTubeAccount).not.toHaveBeenCalled();
    expect(mocks.appendAuditEvent).not.toHaveBeenCalled();
  });

  it("syncs the account and audits only the allowed result fields", async () => {
    mocks.syncYouTubeAccount.mockResolvedValue({
      ...result(),
      accessToken: "audit-token-must-not-escape",
      rawResponse: { secret: "raw-provider-response" },
    });

    await POST(new Request("http://localhost"), context());

    expect(mocks.syncYouTubeAccount).toHaveBeenCalledWith("account-1");
    expect(mocks.appendAuditEvent).toHaveBeenCalledWith({
      actorTelegramId: "telegram-1",
      actorUserId: "user-1",
      action: "account_analytics_synced",
      entityType: "social_account",
      entityId: "account-1",
      after: {
        accountId: "account-1",
        status: "synced",
        snapshotCount: 4,
        range: {
          start: "2026-08-18T20:30:00.000Z",
          end: "2026-08-20T20:30:00.000Z",
        },
      },
    });
    expect(JSON.stringify(mocks.appendAuditEvent.mock.calls)).not.toContain("audit-token-must-not-escape");
    expect(JSON.stringify(mocks.appendAuditEvent.mock.calls)).not.toContain("raw-provider-response");
  });

  it.each([
    [result(), 200],
    [result({ status: "skipped", code: "SYNC_IN_PROGRESS", snapshotCount: 0 }), 409],
    [result({ status: "failed", code: "ACCOUNT_NOT_SYNCABLE", snapshotCount: 0 }), 422],
    [result({ status: "failed", code: "RECONNECT_REQUIRED", snapshotCount: 0 }), 502],
    [result({ status: "failed", code: "SYNC_FAILED", snapshotCount: 0 }), 502],
  ] as const)("maps sync result %# to HTTP status %i", async (syncResult, expectedStatus) => {
    mocks.syncYouTubeAccount.mockResolvedValue(syncResult);

    const response = await POST(new Request("http://localhost"), context());

    expect(response.status).toBe(expectedStatus);
  });
});

describe("GET /api/accounts/:id/capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ user, response: null });
    mocks.canAccessAccount.mockReturnValue(true);
    mocks.selectLimit.mockResolvedValue([{ id: "account-1", capabilities: { upload: true } }]);
  });

  it("returns 403 before reading an inaccessible account", async () => {
    mocks.canAccessAccount.mockReturnValue(false);

    const response = await GET(new Request("http://localhost"), getContext("account-secret"));

    expect(response.status).toBe(403);
    expect(mocks.canAccessAccount).toHaveBeenCalledWith(user, "account-secret");
    expect(mocks.selectLimit).not.toHaveBeenCalled();
  });

  it("returns 404 only for an accessible account that does not exist", async () => {
    mocks.selectLimit.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost"), getContext("missing"));

    expect(response.status).toBe(404);
    expect(mocks.canAccessAccount).toHaveBeenCalledWith(user, "missing");
  });
});
