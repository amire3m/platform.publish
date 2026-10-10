import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  returning: vi.fn(),
  where: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    update: mocks.update,
  },
}));
vi.mock("@/lib/api-helpers", () => ({
  requirePermission: mocks.requirePermission,
  jsonError: (message: string, status = 400, code?: string) => Response.json({ ok: false, error: message, code }, { status }),
  jsonOk: (data: unknown, status = 200) => Response.json({ ok: true, data }, { status }),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/mirrors/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mirrors/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ user: { id: "user-1" }, response: null });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: "mirror-1" }]);
  });

  it("rejects users without content-room management permission", async () => {
    const denied = Response.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
    mocks.requirePermission.mockResolvedValue({ user: null, response: denied });

    const response = await POST(request({ fileId: "file-1", forceUncertain: true }));

    expect(response.status).toBe(403);
    expect(mocks.requirePermission).toHaveBeenCalledWith("manage_content_room");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("atomically requeues an uncertain submission only when explicitly forced", async () => {
    const response = await POST(request({ fileId: "file-1", forceUncertain: true }));

    expect(response.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "queued",
      remoteTaskId: null,
      error: null,
    }));
    expect(mocks.returning).toHaveBeenCalledOnce();
  });

  it("refuses recovery when the row is no longer an uncertain claim", async () => {
    mocks.returning.mockResolvedValue([]);

    const response = await POST(request({ fileId: "file-1", forceUncertain: true }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "CLAIM_CHANGED" });
  });
});
