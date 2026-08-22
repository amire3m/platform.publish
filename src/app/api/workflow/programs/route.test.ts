import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";

import { handleProgramsRequest, type ProgramsRouteDependencies } from "./route";

function deps(overrides: Partial<ProgramsRouteDependencies> & { user?: unknown } = {}): ProgramsRouteDependencies {
  const user = overrides.user !== undefined ? overrides.user : { id: "u1", role: "manager" };
  const requirePermission = vi.fn().mockImplementation(async (perm: string) => {
    if (!user) {
      return { user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") };
    }
    // Simulate permission check: allow view_workflow and manage_programs for test user
    const allowed =
      (perm === "view_workflow" && (user as { role?: string }).role !== "none") ||
      (perm === "manage_programs" && (user as { role?: string }).role === "manager") ||
      perm === "view_workflow" ||
      perm === "manage_programs";
    // For user=null we already returned 403, for other cases if role is blocked we return 403
    if ((user as { role?: string }).role === "viewer" && perm === "manage_programs") {
      return { user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") };
    }
    return { user, response: null };
  });

  return {
    requirePermission: overrides.requirePermission ?? requirePermission,
    repository: overrides.repository ?? {
      listPrograms: vi.fn().mockResolvedValue([]),
      createProgram: vi.fn().mockResolvedValue({ id: "WPR-1405-000001", title: "فرات ۳۱", version: 1 }),
      getProgram: vi.fn().mockResolvedValue(null),
      instantiateTemplate: vi.fn().mockResolvedValue([]),
    },
  } as unknown as ProgramsRouteDependencies;
}

describe("GET/POST /api/workflow/programs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects creation without manage_programs", async () => {
    const repository = {
      listPrograms: vi.fn(),
      createProgram: vi.fn(),
      getProgram: vi.fn(),
      instantiateTemplate: vi.fn(),
    };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleProgramsRequest(new Request("http://test", { method: "POST", body: JSON.stringify({ title: "x" }) }), {
      requirePermission: requirePermission as never,
      repository: repository as never,
    });
    expect(response.status).toBe(403);
    expect(repository.createProgram).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid program payload", async () => {
    const repository = {
      listPrograms: vi.fn(),
      createProgram: vi.fn(),
      getProgram: vi.fn(),
      instantiateTemplate: vi.fn(),
    };
    const response = await handleProgramsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "" }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(repository.createProgram).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid dueAt iso datetime", async () => {
    const repository = {
      listPrograms: vi.fn(),
      createProgram: vi.fn(),
      getProgram: vi.fn(),
      instantiateTemplate: vi.fn(),
    };
    const response = await handleProgramsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "ok", dueAt: "not-a-date" }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.createProgram).not.toHaveBeenCalled();
  });

  it("creates program with valid data", async () => {
    const repository = {
      listPrograms: vi.fn(),
      createProgram: vi.fn().mockResolvedValue({ id: "WPR-1405-000001", title: "فرات ۳۱", version: 1 }),
      getProgram: vi.fn(),
      instantiateTemplate: vi.fn().mockResolvedValue([]),
    };
    const response = await handleProgramsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "فرات ۳۱" }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(201);
    expect(repository.createProgram).toHaveBeenCalledWith(expect.objectContaining({ title: "فرات ۳۱" }));
  });

  it("rejects list without view_workflow", async () => {
    const repository = { listPrograms: vi.fn(), createProgram: vi.fn(), getProgram: vi.fn(), instantiateTemplate: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") });
    const response = await handleProgramsRequest(new Request("http://test", { method: "GET" }), {
      requirePermission: requirePermission as never,
      repository: repository as never,
    });
    expect(response.status).toBe(401);
    expect(repository.listPrograms).not.toHaveBeenCalled();
  });

  it("lists programs with view_workflow", async () => {
    const repository = {
      listPrograms: vi.fn().mockResolvedValue([{ id: "WPR-1", title: "a" }]),
      createProgram: vi.fn(),
      getProgram: vi.fn(),
      instantiateTemplate: vi.fn(),
    };
    const response = await handleProgramsRequest(new Request("http://test", { method: "GET" }), deps({ repository: repository as never }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(repository.listPrograms).toHaveBeenCalled();
  });

  it("instantiates template when templateId provided", async () => {
    const repository = {
      listPrograms: vi.fn(),
      createProgram: vi.fn().mockResolvedValue({ id: "WPR-1", title: "t", version: 1 }),
      getProgram: vi.fn(),
      instantiateTemplate: vi.fn().mockResolvedValue([]),
    };
    const response = await handleProgramsRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ title: "t", templateId: "WTM-1" }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(201);
    expect(repository.instantiateTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateId: "WTM-1", programId: "WPR-1" }));
  });
});
