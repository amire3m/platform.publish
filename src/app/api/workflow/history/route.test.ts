import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleHistoryRequest, type HistoryRouteDependencies } from "./route";

function deps(overrides: Partial<HistoryRouteDependencies> = {}): HistoryRouteDependencies {
  const requirePermission = vi.fn().mockImplementation(async (perm: string) => {
    if (perm === "view_workflow") return { user: { id: "u1", role: "manager" }, response: null };
    return { user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") };
  });
  return {
    requirePermission: overrides.requirePermission ?? (requirePermission as never),
    repository: overrides.repository ?? {
      listHistory: vi.fn().mockResolvedValue({ items: [{ id: "WEV-1", entityType: "workflow_program", action: "created" }], total: 1, page: 1, pageSize: 20 }),
    },
  } as unknown as HistoryRouteDependencies;
}

describe("GET /api/workflow/history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects without view_workflow and does not call repository", async () => {
    const repository = { listHistory: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleHistoryRequest(new Request("http://test/api/workflow/history"), {
      requirePermission: requirePermission as never,
      repository: repository as never,
    });
    expect(response.status).toBe(403);
    expect(repository.listHistory).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid pagination", async () => {
    const repository = { listHistory: vi.fn() };
    const response = await handleHistoryRequest(new Request("http://test/api/workflow/history?page=0&pageSize=200"), deps({ repository: repository as never }));
    expect(response.status).toBe(422);
    expect(repository.listHistory).not.toHaveBeenCalled();
  });

  it("returns paginated history with metadata", async () => {
    const items = Array.from({ length: 2 }, (_, i) => ({ id: `WEV-${i}`, entityType: "workflow_program", action: "created", createdAt: new Date() }));
    const repository = { listHistory: vi.fn().mockResolvedValue({ items, total: 20, page: 1, pageSize: 2 }) };
    const response = await handleHistoryRequest(new Request("http://test/api/workflow/history?page=1&pageSize=2"), deps({ repository: repository as never }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.total).toBe(20);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(2);
    expect(body.data.totalPages).toBe(10);
    expect(repository.listHistory).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 2 }));
  });

  it("supports filtering by entityType and entityId", async () => {
    const repository = { listHistory: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }) };
    const response = await handleHistoryRequest(
      new Request("http://test/api/workflow/history?entityType=workflow_deliverable&entityId=WDL-1"),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    expect(repository.listHistory).toHaveBeenCalledWith(expect.objectContaining({ entityType: "workflow_deliverable", entityId: "WDL-1" }));
  });

  it("defaults pagination when no query provided", async () => {
    const repository = { listHistory: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }) };
    const response = await handleHistoryRequest(new Request("http://test/api/workflow/history"), deps({ repository: repository as never }));
    expect(response.status).toBe(200);
    expect(repository.listHistory).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
  });

  it("handles unauthenticated 401", async () => {
    const repository = { listHistory: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") });
    const response = await handleHistoryRequest(new Request("http://test/api/workflow/history"), {
      requirePermission: requirePermission as never,
      repository: repository as never,
    });
    expect(response.status).toBe(401);
    expect(repository.listHistory).not.toHaveBeenCalled();
  });
});
