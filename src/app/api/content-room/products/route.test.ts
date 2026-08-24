import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleProductsRequest, type ProductsRouteDependencies } from "./route";

function deps(overrides: Partial<ProductsRouteDependencies> & { user?: unknown } = {}): ProductsRouteDependencies {
  const user = overrides.user !== undefined ? overrides.user : { id: "u1", role: "manager" };
  const requirePermission = vi.fn().mockImplementation(async (perm: string) => {
    if (!user) {
      return { user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") } as never;
    }
    // viewer cannot manage, etc. For content-room, manage_content_room requires manager/owner, view requires any
    if (perm === "manage_content_room" && (user as { role?: string }).role === "viewer") {
      return { user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") } as never;
    }
    if (perm === "view_content_room" && (user as { role?: string }).role === "none") {
      return { user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") } as never;
    }
    return { user, response: null } as never;
  });

  return {
    requirePermission: overrides.requirePermission ?? (requirePermission as never),
    repository: overrides.repository ?? {
      listProducts: vi.fn().mockResolvedValue([]),
      createProduct: vi.fn().mockResolvedValue({ id: "CPR-1405-000001", title: "سریال تست", version: 1 }),
    },
  } as unknown as ProductsRouteDependencies;
}

describe("GET/POST /api/content-room/products", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects list without view_content_room (401)", async () => {
    const repository = { listProducts: vi.fn(), createProduct: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") });
    const response = await handleProductsRequest(new Request("http://test", { method: "GET" }), {
      requirePermission: requirePermission as never,
      repository: repository as never,
    });
    expect(response.status).toBe(401);
    expect(repository.listProducts).not.toHaveBeenCalled();
  });

  it("rejects list without view_content_room (403)", async () => {
    const repository = { listProducts: vi.fn(), createProduct: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleProductsRequest(new Request("http://test", { method: "GET" }), {
      requirePermission: requirePermission as never,
      repository: repository as never,
    });
    expect(response.status).toBe(403);
    expect(repository.listProducts).not.toHaveBeenCalled();
  });

  it("lists products with view_content_room and applies filters", async () => {
    const repository = {
      listProducts: vi.fn().mockResolvedValue([{ id: "CPR-1", title: "فرات ۳۱" }]),
      createProduct: vi.fn(),
    };
    const response = await handleProductsRequest(
      new Request("http://test?type=serial&channel=zed_revayat&status=imported&query=فرات", { method: "GET" }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(repository.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ productType: "serial", channel: "zed_revayat", status: "imported", search: "فرات" }),
      expect.anything(),
    );
  });

  it("supports alias filters productType, search, q", async () => {
    const repository = {
      listProducts: vi.fn().mockResolvedValue([]),
      createProduct: vi.fn(),
    };
    const response = await handleProductsRequest(
      new Request("http://test?productType=documentary&q=مستند", { method: "GET" }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    expect(repository.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ productType: "documentary", search: "مستند" }),
      expect.anything(),
    );
  });

  it("rejects creation without manage_content_room (403)", async () => {
    const repository = { listProducts: vi.fn(), createProduct: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleProductsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "x", productType: "serial", channel: "zed_revayat", partsCount: 2 }) }),
      { requirePermission: requirePermission as never, repository: repository as never },
    );
    expect(response.status).toBe(403);
    expect(repository.createProduct).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid product payload (title empty)", async () => {
    const repository = { listProducts: vi.fn(), createProduct: vi.fn() };
    const response = await handleProductsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "", productType: "serial", channel: "zed_revayat", partsCount: 2 }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toBe("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.");
    expect(repository.createProduct).not.toHaveBeenCalled();
  });

  it("does not expose unexpected repository errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository = {
      listProducts: vi.fn().mockRejectedValue(new Error("database connection secret")),
      createProduct: vi.fn(),
    };
    const response = await handleProductsRequest(
      new Request("http://test", { method: "GET" }),
      deps({ repository: repository as never }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "خطای داخلی سرور رخ داد. دوباره تلاش کنید.",
      code: "INTERNAL_ERROR",
    });
  });

  it("returns 422 for invalid productType", async () => {
    const repository = { listProducts: vi.fn(), createProduct: vi.fn() };
    const response = await handleProductsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "ok", productType: "invalid", channel: "zed_revayat", partsCount: 2 }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.createProduct).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid channel", async () => {
    const repository = { listProducts: vi.fn(), createProduct: vi.fn() };
    const response = await handleProductsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "ok", productType: "serial", channel: "invalid", partsCount: 2 }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.createProduct).not.toHaveBeenCalled();
  });

  it("returns 422 for partsCount out of range (0)", async () => {
    const repository = { listProducts: vi.fn(), createProduct: vi.fn() };
    const response = await handleProductsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "ok", productType: "serial", channel: "zed_revayat", partsCount: 0 }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.createProduct).not.toHaveBeenCalled();
  });

  it("returns 422 for partsCount >50", async () => {
    const repository = { listProducts: vi.fn(), createProduct: vi.fn() };
    const response = await handleProductsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "ok", productType: "serial", channel: "zed_revayat", partsCount: 51 }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.createProduct).not.toHaveBeenCalled();
  });

  it("returns 422 for notes too long", async () => {
    const repository = { listProducts: vi.fn(), createProduct: vi.fn() };
    const response = await handleProductsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "ok", productType: "serial", channel: "zed_revayat", partsCount: 1, notes: "a".repeat(4001) }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.createProduct).not.toHaveBeenCalled();
  });

  it("creates product with valid data (201)", async () => {
    const repository = {
      listProducts: vi.fn(),
      createProduct: vi.fn().mockResolvedValue({ id: "CPR-1405-000001", title: "فرات ۳۱", version: 1 }),
    };
    const response = await handleProductsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "فرات ۳۱", productType: "serial", channel: "zed_revayat", partsCount: 3, notes: "یادداشت" }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(201);
    expect(repository.createProduct).toHaveBeenCalledWith(expect.objectContaining({ title: "فرات ۳۱", productType: "serial", channel: "zed_revayat", partsCount: 3 }));
  });

  it("allows nullable notes", async () => {
    const repository = {
      listProducts: vi.fn(),
      createProduct: vi.fn().mockResolvedValue({ id: "CPR-1", title: "t", version: 1 }),
    };
    const response = await handleProductsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "t", productType: "film", channel: "shock", partsCount: 1, notes: null }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(201);
  });
});
