import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleProgramDeliverablesRequest, type ProgramDeliverablesRouteDependencies } from "./route";

function deps(overrides: Partial<ProgramDeliverablesRouteDependencies> = {}): ProgramDeliverablesRouteDependencies {
  const requirePermission = vi.fn().mockImplementation(async (perm: string) => {
    if (perm === "manage_programs") return { user: { id: "u1", role: "manager" }, response: null };
    if (perm === "view_workflow") return { user: { id: "u1", role: "manager" }, response: null };
    return { user: { id: "u1", role: "manager" }, response: null };
  });
  return {
    requirePermission: overrides.requirePermission ?? (requirePermission as never),
    repository: overrides.repository ?? {
      createDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", name: "t", version: 1 }),
      reorderDeliverables: vi.fn().mockResolvedValue([]),
      getProgram: vi.fn().mockResolvedValue({ id: "WPR-1", title: "p" }),
      listDeliverablesForProgram: vi.fn().mockResolvedValue([]),
    },
  } as unknown as ProgramDeliverablesRouteDependencies;
}

describe("POST/GET/PATCH /api/workflow/programs/:id/deliverables", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects creation without manage_programs and does not call repository", async () => {
    const repository = {
      createDeliverable: vi.fn(),
      reorderDeliverables: vi.fn(),
      getProgram: vi.fn(),
      listDeliverablesForProgram: vi.fn(),
    };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleProgramDeliverablesRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ name: "x" }) }),
      { params: Promise.resolve({ id: "WPR-1" }) },
      { requirePermission: requirePermission as never, repository: repository as never },
    );
    expect(response.status).toBe(403);
    expect(repository.createDeliverable).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid deliverable payload and does not call repository", async () => {
    const repository = { createDeliverable: vi.fn(), reorderDeliverables: vi.fn(), getProgram: vi.fn(), listDeliverablesForProgram: vi.fn() };
    const response = await handleProgramDeliverablesRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ name: "" }) }),
      { params: Promise.resolve({ id: "WPR-1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(repository.createDeliverable).not.toHaveBeenCalled();
  });

  it("creates deliverable with valid data (201)", async () => {
    const repository = {
      createDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1405-000001", name: "ویدیو", version: 1 }),
      reorderDeliverables: vi.fn(),
      getProgram: vi.fn(),
      listDeliverablesForProgram: vi.fn(),
    };
    const response = await handleProgramDeliverablesRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ name: "ویدیو" }) }),
      { params: Promise.resolve({ id: "WPR-1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(201);
    expect(repository.createDeliverable).toHaveBeenCalledWith(expect.objectContaining({ programId: "WPR-1", name: "ویدیو" }));
  });

  it("rejects reorder without manage_programs", async () => {
    const repository = { createDeliverable: vi.fn(), reorderDeliverables: vi.fn(), getProgram: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleProgramDeliverablesRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ orderedIds: ["WDL-1"] }) }),
      { params: Promise.resolve({ id: "WPR-1" }) },
      { requirePermission: requirePermission as never, repository: repository as never },
    );
    expect(response.status).toBe(403);
    expect(repository.reorderDeliverables).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid reorder payload and does not call repository", async () => {
    const repository = { createDeliverable: vi.fn(), reorderDeliverables: vi.fn(), getProgram: vi.fn() };
    const response = await handleProgramDeliverablesRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ orderedIds: [] }) }),
      { params: Promise.resolve({ id: "WPR-1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.reorderDeliverables).not.toHaveBeenCalled();
  });

  it("reorders deliverables successfully", async () => {
    const repository = {
      createDeliverable: vi.fn(),
      reorderDeliverables: vi.fn().mockResolvedValue([{ id: "WDL-1", sortOrder: 0 }, { id: "WDL-2", sortOrder: 1 }]),
      getProgram: vi.fn(),
    };
    const response = await handleProgramDeliverablesRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ orderedIds: ["WDL-2", "WDL-1"] }) }),
      { params: Promise.resolve({ id: "WPR-1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    expect(repository.reorderDeliverables).toHaveBeenCalledWith(expect.objectContaining({ programId: "WPR-1", orderedIds: ["WDL-2", "WDL-1"] }));
  });

  it("rejects GET without view_workflow", async () => {
    const repository = { createDeliverable: vi.fn(), reorderDeliverables: vi.fn(), listDeliverablesForProgram: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") });
    const response = await handleProgramDeliverablesRequest(
      new Request("http://test", { method: "GET" }),
      { params: Promise.resolve({ id: "WPR-1" }) },
      { requirePermission: requirePermission as never, repository: repository as never },
    );
    expect(response.status).toBe(401);
    expect(repository.listDeliverablesForProgram).not.toHaveBeenCalled();
  });

  it("maps VERSION_CONFLICT to 409", async () => {
    const repository = {
      createDeliverable: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }),
      reorderDeliverables: vi.fn(),
      getProgram: vi.fn(),
    };
    const response = await handleProgramDeliverablesRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ name: "ویدیو" }) }),
      { params: Promise.resolve({ id: "WPR-1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
  });
});
