import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleProductRequest, type ProductRouteDependencies } from "./route";

function makeDeps(overrides: Partial<ProductRouteDependencies> & { user?: unknown; requirePermissionResult?: unknown } = {}): ProductRouteDependencies {
  const user = overrides.user !== undefined ? overrides.user : { id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] };
  const getCurrentUser = vi.fn().mockResolvedValue(user);
  const requirePermission = vi.fn().mockImplementation(async (perm: string) => {
    if (!user) return { user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") } as never;
    if ((user as { role?: string }).role === "viewer" && perm === "view_content_room") {
      return { user, response: null } as never;
    }
    // For PATCH, manager has both permissions, editor has update_assigned_content
    return { user, response: null } as never;
  });

  return {
    getCurrentUser: overrides.getCurrentUser ?? (getCurrentUser as never),
    requirePermission: overrides.requirePermission ?? (requirePermission as never),
    repository: overrides.repository ?? {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "imported", version: 1, parts: [] }),
      updateProductStatus: vi.fn().mockResolvedValue({ id: "CPR-1", status: "editing_youtube", version: 2 }),
    },
  } as unknown as ProductRouteDependencies;
}

function request(method: string, body?: unknown, url = "http://test"): Request {
  return new Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
  });
}

describe("GET/PATCH /api/content-room/products/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects GET without view_content_room (401)", async () => {
    const repository = { getProduct: vi.fn(), updateProductStatus: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") });
    const getCurrentUser = vi.fn().mockResolvedValue(null);
    const response = await handleProductRequest(request("GET"), { params: Promise.resolve({ id: "CPR-1" }) }, {
      requirePermission: requirePermission as never,
      getCurrentUser: getCurrentUser as never,
      repository: repository as never,
    });
    expect(response.status).toBe(401);
    expect(repository.getProduct).not.toHaveBeenCalled();
  });

  it("rejects GET without view_content_room (403)", async () => {
    const repository = { getProduct: vi.fn(), updateProductStatus: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleProductRequest(request("GET"), { params: Promise.resolve({ id: "CPR-1" }) }, {
      requirePermission: requirePermission as never,
      getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", role: "viewer" }) as never,
      repository: repository as never,
    });
    expect(response.status).toBe(403);
  });

  it("returns 404 when product not found (GET)", async () => {
    const repository = { getProduct: vi.fn().mockResolvedValue(null), updateProductStatus: vi.fn() };
    const response = await handleProductRequest(request("GET"), { params: Promise.resolve({ id: "missing" }) }, makeDeps({ repository: repository as never }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("gets product successfully", async () => {
    const repository = { getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "imported", version: 1 }), updateProductStatus: vi.fn() };
    const response = await handleProductRequest(request("GET"), { params: Promise.resolve({ id: "CPR-1" }) }, makeDeps({ repository: repository as never }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe("CPR-1");
  });

  it("adds playable media URLs to content parts", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({
        id: "CPR-1",
        title: "a",
        status: "imported",
        version: 1,
        parts: [{ id: "part-1", fileRef: "telegram-video-id", coverFileRef: "telegram-cover-id" }],
      }),
      updateProductStatus: vi.fn(),
    };
    const response = await handleProductRequest(request("GET"), { params: Promise.resolve({ id: "CPR-1" }) }, makeDeps({ repository: repository as never }));
    const body = await response.json();

    expect(body.data.parts[0].playbackUrl).toMatch(/^\/api\/media\/telegram\//);
    expect(body.data.parts[0].coverUrl).toMatch(/^\/api\/media\/telegram\//);
  });

  it("rejects PATCH without update_assigned_content or manage_content_room (403)", async () => {
    const repository = { getProduct: vi.fn(), updateProductStatus: vi.fn() };
    const response = await handleProductRequest(
      request("PATCH", { status: "editing_youtube", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({
        user: { id: "u2", role: "viewer", allowedActions: [], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(403);
    expect(repository.updateProductStatus).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated on PATCH", async () => {
    const repository = { getProduct: vi.fn(), updateProductStatus: vi.fn() };
    const response = await handleProductRequest(
      request("PATCH", { status: "editing_youtube", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ user: null, repository: repository as never }),
    );
    expect(response.status).toBe(401);
    expect(repository.updateProductStatus).not.toHaveBeenCalled();
  });

  it("returns 422 for missing expectedVersion", async () => {
    const repository = { getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", status: "imported", version: 1 }), updateProductStatus: vi.fn() };
    const response = await handleProductRequest(
      request("PATCH", { status: "editing_youtube" }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.updateProductStatus).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid status", async () => {
    const repository = { getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", status: "imported", version: 1 }), updateProductStatus: vi.fn() };
    const response = await handleProductRequest(
      request("PATCH", { status: "invalid_status", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.updateProductStatus).not.toHaveBeenCalled();
  });

  it("returns 422 for REASON_REQUIRED when backward without reason", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "ready_to_send", version: 7 }),
      updateProductStatus: vi.fn(),
    };
    const response = await handleProductRequest(
      request("PATCH", { status: "imported", expectedVersion: 7 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("REASON_REQUIRED");
    expect(repository.updateProductStatus).not.toHaveBeenCalled();
  });

  it("returns 422 for skip without reason (imported -> copyright_fix)", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "imported", version: 1 }),
      updateProductStatus: vi.fn(),
    };
    const response = await handleProductRequest(
      request("PATCH", { status: "copyright_fix", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.updateProductStatus).not.toHaveBeenCalled();
  });

  it("allows backward with reason", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "ready_to_send", version: 7 }),
      updateProductStatus: vi.fn().mockResolvedValue({ id: "CPR-1", status: "imported", version: 8 }),
    };
    const response = await handleProductRequest(
      request("PATCH", { status: "imported", expectedVersion: 7, reason: "بازگشت برای اصلاح" }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    expect(repository.updateProductStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "imported", reason: "بازگشت برای اصلاح" }));
  });

  it("returns 409 for VERSION_CONFLICT", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "imported", version: 2 }),
      updateProductStatus: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }),
    };
    const response = await handleProductRequest(
      request("PATCH", { status: "editing_youtube", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("VERSION_CONFLICT");
  });

  it("returns 422 for INVALID_TRANSITION (same status)", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "imported", version: 1 }),
      updateProductStatus: vi.fn().mockRejectedValue({ code: "INVALID_TRANSITION", message: "وضعیت تکراری است." }),
    };
    const response = await handleProductRequest(
      request("PATCH", { status: "imported", expectedVersion: 1, reason: "دلیل" }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
  });

  it("allows editor with update_assigned_content to patch", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "imported", version: 1 }),
      updateProductStatus: vi.fn().mockResolvedValue({ id: "CPR-1", status: "editing_youtube", version: 2 }),
    };
    const response = await handleProductRequest(
      request("PATCH", { status: "editing_youtube", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({
        user: { id: "u2", role: "editor", allowedActions: ["update_assigned_content"], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("patches forward sequential without reason successfully", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "imported", version: 1 }),
      updateProductStatus: vi.fn().mockResolvedValue({ id: "CPR-1", status: "editing_youtube", version: 2 }),
    };
    const response = await handleProductRequest(
      request("PATCH", { status: "editing_youtube", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    expect(repository.updateProductStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "editing_youtube", expectedVersion: 1 }));
  });
});

describe("PATCH /api/content-room/products/:id metadata edit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("edits metadata successfully without title change", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "old", status: "imported", version: 1 }),
      updateProductStatus: vi.fn(),
      updateProductMetadata: vi.fn().mockResolvedValue({ id: "CPR-1", title: "old", status: "imported", version: 2 }),
    };
    const response = await handleProductRequest(
      request("PATCH", { notes: "یادداشت جدید", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.version).toBe(2);
    expect(repository.updateProductMetadata).toHaveBeenCalledWith(expect.objectContaining({ id: "CPR-1", notes: "یادداشت جدید", expectedVersion: 1 }));
  });

  it("edits title and syncs workflow when manage_programs allowed", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "old", status: "imported", version: 1 }),
      updateProductStatus: vi.fn(),
      updateProductMetadata: vi.fn().mockResolvedValue({ id: "CPR-1", title: "new title", status: "imported", version: 2 }),
    };
    const syncWorkflowTitle = vi.fn().mockResolvedValue(undefined);
    const response = await handleProductRequest(
      request("PATCH", { title: "new title", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      {
        ...makeDeps({ repository: repository as never }),
        syncWorkflowTitle: syncWorkflowTitle as never,
      } as never,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.title).toBe("new title");
    expect(body.data.workflowTitleSync).toBe("synced");
    expect(syncWorkflowTitle).toHaveBeenCalledWith("CPR-1", "new title", expect.any(String));
  });

  it("edits title without manage_programs returns skipped_no_permission", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "old", status: "imported", version: 1 }),
      updateProductStatus: vi.fn(),
      updateProductMetadata: vi.fn().mockResolvedValue({ id: "CPR-1", title: "new title", status: "imported", version: 2 }),
    };
    const syncWorkflowTitle = vi.fn();
    const response = await handleProductRequest(
      request("PATCH", { title: "new title", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({
        user: { id: "u2", role: "editor", allowedActions: ["update_assigned_content"], allowedAccountIds: [] },
        repository: repository as never,
      }) as never,
    );
    // editor lacks manage_programs, so sync should be skipped
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.workflowTitleSync).toBe("skipped_no_permission");
    expect(syncWorkflowTitle).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid metadata (empty title)", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "old", status: "imported", version: 1 }),
      updateProductStatus: vi.fn(),
      updateProductMetadata: vi.fn(),
    };
    const response = await handleProductRequest(
      request("PATCH", { title: "", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.updateProductMetadata).not.toHaveBeenCalled();
  });

  it("returns 409 for VERSION_CONFLICT on metadata edit", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "old", status: "imported", version: 2 }),
      updateProductStatus: vi.fn(),
      updateProductMetadata: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }),
    };
    const response = await handleProductRequest(
      request("PATCH", { title: "new", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
  });

  it("returns 404 when product not found on metadata edit", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue(null),
      updateProductStatus: vi.fn(),
      updateProductMetadata: vi.fn(),
    };
    const response = await handleProductRequest(
      request("PATCH", { title: "new", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "missing" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(404);
  });

  it("handles partsCount update", async () => {
    const repository = {
      getProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", status: "imported", version: 1, partsCount: 2 }),
      updateProductStatus: vi.fn(),
      updateProductMetadata: vi.fn().mockResolvedValue({ id: "CPR-1", title: "a", partsCount: 3, version: 2 }),
    };
    const response = await handleProductRequest(
      request("PATCH", { partsCount: 3, expectedVersion: 1 }),
      { params: Promise.resolve({ id: "CPR-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    expect(repository.updateProductMetadata).toHaveBeenCalledWith(expect.objectContaining({ partsCount: 3 }));
  });
});
