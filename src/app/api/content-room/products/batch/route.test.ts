import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleBatchRequest, type BatchRouteDependencies } from "./route";

function makeDeps(overrides: Partial<BatchRouteDependencies> = {}): BatchRouteDependencies {
  const requirePermission = vi.fn().mockResolvedValue({ user: { id: "u1", role: "manager" } as never, response: null });
  const repository = {
    createProductsBatch: vi.fn().mockResolvedValue([
      { id: "CPR-1", title: "A", productType: "teaser", channel: "tamashin", partsCount: 1, version: 1 },
      { id: "CPR-2", title: "B", productType: "music_video", channel: "shock", partsCount: 1, version: 1 },
    ]),
  };
  return {
    requirePermission: (overrides.requirePermission as never) ?? (requirePermission as never),
    repository: (overrides.repository as never) ?? (repository as never),
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/content-room/products/batch", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/content-room/products/batch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects without manage_content_room (401)", async () => {
    const repository = { createProductsBatch: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") });
    const res = await handleBatchRequest(req({ products: [{ title: "A", productType: "teaser", channel: "tamashin", partsCount: 1 }] }), {
      requirePermission: requirePermission as never,
      repository: repository as never,
    });
    expect(res.status).toBe(401);
    expect(repository.createProductsBatch).not.toHaveBeenCalled();
  });

  it("rejects without manage_content_room (403)", async () => {
    const repository = { createProductsBatch: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const res = await handleBatchRequest(req({ products: [{ title: "A", productType: "teaser", channel: "tamashin", partsCount: 1 }] }), {
      requirePermission: requirePermission as never,
      repository: repository as never,
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 with rowIndex on validation failure (empty title)", async () => {
    const deps = makeDeps();
    const res = await handleBatchRequest(req({ products: [{ title: "", productType: "teaser", channel: "tamashin", partsCount: 1 }] }), deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    // batchCreateSchema should expose rowIndex 0 for first row
    expect(body.rowIndex).toBe(0);
    expect(deps.repository.createProductsBatch).not.toHaveBeenCalled();
  });

  it("returns 400 when exceeding 10 products", async () => {
    const deps = makeDeps();
    const products = Array.from({ length: 11 }, (_, i) => ({ title: `T${i}`, productType: "teaser", channel: "tamashin", partsCount: 1 }));
    const res = await handleBatchRequest(req({ products }), deps);
    expect(res.status).toBe(400);
  });

  it("returns 400 with rowIndex when repository throws rowIndex error (partial failure atomic)", async () => {
    const err = Object.assign(new Error("عنوان باید ۱ تا ۲۰۰ کاراکتر باشد."), { code: "INVALID_TRANSITION", rowIndex: 1 });
    const repository = { createProductsBatch: vi.fn().mockRejectedValue(err) };
    const deps = makeDeps({ repository: repository as never });
    const res = await handleBatchRequest(
      req({ products: [{ title: "A", productType: "teaser", channel: "tamashin", partsCount: 1 }, { title: "", productType: "teaser", channel: "tamashin", partsCount: 1 }] }),
      deps,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.rowIndex).toBe(1);
    expect(body.error).toBeDefined();
  });

  it("creates batch successfully (201)", async () => {
    const deps = makeDeps();
    const res = await handleBatchRequest(req({ products: [{ title: "A", productType: "teaser", channel: "tamashin", partsCount: 2 }, { title: "B", productType: "music_video", channel: "shock", partsCount: 1 }] }), deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.products).toHaveLength(2);
    expect(deps.repository.createProductsBatch).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ title: "A", actorUserId: "u1" })]));
  });

  it("returns 422 for malformed JSON", async () => {
    const deps = makeDeps();
    const request = new Request("http://localhost/api/content-room/products/batch", { method: "POST", body: "not-json", headers: { "content-type": "application/json" } });
    const res = await handleBatchRequest(request, deps);
    expect(res.status).toBe(422);
  });

  it("returns 409 for VERSION_CONFLICT from repository", async () => {
    const err = Object.assign(new Error("نسخه قدیمی است."), { code: "VERSION_CONFLICT" });
    const repository = { createProductsBatch: vi.fn().mockRejectedValue(err) };
    const deps = makeDeps({ repository: repository as never });
    const res = await handleBatchRequest(req({ products: [{ title: "A", productType: "teaser", channel: "tamashin", partsCount: 1 }] }), deps);
    expect(res.status).toBe(409);
  });
});
