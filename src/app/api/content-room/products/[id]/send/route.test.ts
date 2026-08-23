import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleSendRequest, type SendRouteDependencies } from "./route";

function deps(overrides: Partial<SendRouteDependencies> & { user?: unknown } = {}): SendRouteDependencies {
  const user = overrides.user !== undefined ? overrides.user : { id: "u1", role: "manager" };
  const requirePermission = vi.fn().mockImplementation(async (perm: string) => {
    if (!user) return { user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") } as never;
    if ((user as { role?: string }).role === "viewer" && perm === "manage_content_room") {
      return { user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") } as never;
    }
    return { user, response: null } as never;
  });

  return {
    requirePermission: overrides.requirePermission ?? (requirePermission as never),
    service: overrides.service ?? {
      sendToPublication: vi.fn().mockResolvedValue({
        product: { id: "CPR-1", version: 8 },
        program: { id: "WPR-1405-000001", title: "محصول آماده" },
        deliverables: [],
        publications: [],
      }),
    },
  } as unknown as SendRouteDependencies;
}

describe("POST /api/content-room/products/:id/send", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects without manage_content_room (401)", async () => {
    const service = { sendToPublication: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") });
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ expectedVersion: 7 }) }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      { requirePermission: requirePermission as never, service: service as never },
    );
    expect(response.status).toBe(401);
    expect(service.sendToPublication).not.toHaveBeenCalled();
  });

  it("rejects without manage_content_room (403)", async () => {
    const service = { sendToPublication: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ expectedVersion: 7 }) }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      { requirePermission: requirePermission as never, service: service as never },
    );
    expect(response.status).toBe(403);
    expect(service.sendToPublication).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid expectedVersion (missing)", async () => {
    const service = { sendToPublication: vi.fn() };
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      deps({ service: service as never }),
    );
    expect(response.status).toBe(422);
    expect(service.sendToPublication).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid expectedVersion (zero)", async () => {
    const service = { sendToPublication: vi.fn() };
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ expectedVersion: 0 }) }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      deps({ service: service as never }),
    );
    expect(response.status).toBe(422);
    expect(service.sendToPublication).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid expectedVersion (negative)", async () => {
    const service = { sendToPublication: vi.fn() };
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ expectedVersion: -1 }) }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      deps({ service: service as never }),
    );
    expect(response.status).toBe(422);
    expect(service.sendToPublication).not.toHaveBeenCalled();
  });

  it("returns 404 for NOT_FOUND", async () => {
    const service = { sendToPublication: vi.fn().mockRejectedValue({ code: "NOT_FOUND", message: "محصول یافت نشد." }) };
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "CPR-missing" }) },
      deps({ service: service as never }),
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 409 for VERSION_CONFLICT", async () => {
    const service = { sendToPublication: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }) };
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      deps({ service: service as never }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("VERSION_CONFLICT");
    expect(service.sendToPublication).toHaveBeenCalledWith(expect.objectContaining({ productId: "CPR-1", expectedVersion: 1 }));
  });

  it("returns 409 for INVALID_TRANSITION (not ready_to_send)", async () => {
    const service = { sendToPublication: vi.fn().mockRejectedValue({ code: "INVALID_TRANSITION", message: "محصول باید در وضعیت آماده ارسال باشد." }) };
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      deps({ service: service as never }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("INVALID_TRANSITION");
  });

  it("succeeds and returns workflow program id", async () => {
    const service = {
      sendToPublication: vi.fn().mockResolvedValue({
        product: { id: "CPR-1", version: 8 },
        program: { id: "WPR-1405-000001", title: "محصول آماده" },
        deliverables: Array(8),
        publications: Array(24),
      }),
    };
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ expectedVersion: 7 }) }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      deps({ service: service as never }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.programId).toBe("WPR-1405-000001");
    expect(service.sendToPublication).toHaveBeenCalledWith(expect.objectContaining({ productId: "CPR-1", expectedVersion: 7 }));
  });

  it("returns 422 for malformed JSON", async () => {
    const service = { sendToPublication: vi.fn() };
    const response = await handleSendRequest(
      new Request("http://test", { method: "POST", body: "not-json" }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      deps({ service: service as never }),
    );
    expect(response.status).toBe(422);
    expect(service.sendToPublication).not.toHaveBeenCalled();
  });
});
