import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  appendAuditEvent: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/api-helpers", () => ({
  requirePermission: mocks.requirePermission,
  jsonOk: (data: unknown) => Response.json({ ok: true, data }),
  jsonError: (message: string, status = 400) => Response.json({ ok: false, error: message }, { status }),
}));

vi.mock("@/lib/telegram/tgdb", () => ({ appendAuditEvent: mocks.appendAuditEvent }));

import { DELETE } from "./route";

describe("DELETE /api/accounts/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({
      user: { id: "user-1", telegramId: "100" },
      response: null,
    });
  });

  it("permanently removes an inactive account and all live references", async () => {
    const account = {
      id: "account-1",
      active: false,
      credentialRef: "credential-1",
      displayName: "Old channel",
    };
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [account] }) }),
    });

    const where = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: vi.fn(() => ({ where })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })),
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const response = await DELETE(new Request("http://localhost/api/accounts/account-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "account-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ success: true, deleted: true });
    expect(tx.delete).toHaveBeenCalledTimes(4);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(mocks.appendAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "account_deleted",
      entityId: "account-1",
      before: account,
    }));
  });

  it("returns 404 without starting a deletion when the account does not exist", async () => {
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    });

    const response = await DELETE(new Request("http://localhost/api/accounts/missing", { method: "DELETE" }), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
