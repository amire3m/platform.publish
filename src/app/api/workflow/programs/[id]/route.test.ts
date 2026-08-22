import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleProgramRequest, type ProgramRouteDependencies } from "./route";

function deps(overrides: Partial<ProgramRouteDependencies> = {}): ProgramRouteDependencies {
  const user = { id: "u1", role: "manager" };
  const requirePermission = vi.fn().mockImplementation(async () => ({ user, response: null }));

  return {
    requirePermission: overrides.requirePermission ?? (requirePermission as never),
    repository: overrides.repository ?? {
      getProgram: vi.fn().mockResolvedValue({ id: "p1", title: "a", version: 1 }),
      updateProgram: vi.fn().mockResolvedValue({ id: "p1", title: "جدید", version: 2 }),
      listPrograms: vi.fn(),
    },
  } as unknown as ProgramRouteDependencies;
}

function request(method: string, body?: unknown, url = "http://test"): Request {
  return new Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
  });
}

describe("GET/PATCH/DELETE /api/workflow/programs/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 409 for a stale patch", async () => {
    const repository = {
      getProgram: vi.fn().mockResolvedValue({ id: "p1", title: "a", version: 2 }),
      updateProgram: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }),
      listPrograms: vi.fn(),
    };
    const response = await handleProgramRequest(
      request("PATCH", { title: "جدید", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "p1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("VERSION_CONFLICT");
  });

  it("returns 404 when program not found", async () => {
    const repository = {
      getProgram: vi.fn().mockResolvedValue(null),
      updateProgram: vi.fn(),
      listPrograms: vi.fn(),
    };
    const response = await handleProgramRequest(
      request("GET"),
      { params: Promise.resolve({ id: "missing" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(404);
  });

  it("returns 422 for missing expectedVersion", async () => {
    const repository = {
      getProgram: vi.fn().mockResolvedValue({ id: "p1", title: "a", version: 1 }),
      updateProgram: vi.fn(),
      listPrograms: vi.fn(),
    };
    const response = await handleProgramRequest(
      request("PATCH", { title: "جدید" }),
      { params: Promise.resolve({ id: "p1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.updateProgram).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid title and does not call repository", async () => {
    const repository = {
      getProgram: vi.fn().mockResolvedValue({ id: "p1", title: "a", version: 1 }),
      updateProgram: vi.fn(),
      listPrograms: vi.fn(),
    };
    const longTitle = "a".repeat(201);
    const response = await handleProgramRequest(
      request("PATCH", { title: longTitle, expectedVersion: 1 }),
      { params: Promise.resolve({ id: "p1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.updateProgram).not.toHaveBeenCalled();
  });

  it("rejects patch without manage_programs", async () => {
    const repository = {
      getProgram: vi.fn(),
      updateProgram: vi.fn(),
      listPrograms: vi.fn(),
    };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleProgramRequest(
      request("PATCH", { title: "x", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "p1" }) },
      deps({ repository: repository as never, requirePermission: requirePermission as never }),
    );
    expect(response.status).toBe(403);
    expect(repository.updateProgram).not.toHaveBeenCalled();
  });

  it("patches program successfully", async () => {
    const repository = {
      getProgram: vi.fn().mockResolvedValue({ id: "p1", title: "a", version: 1 }),
      updateProgram: vi.fn().mockResolvedValue({ id: "p1", title: "جدید", version: 2 }),
      listPrograms: vi.fn(),
    };
    const response = await handleProgramRequest(
      request("PATCH", { title: "جدید", expectedVersion: 1 }),
      { params: Promise.resolve({ id: "p1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    expect(repository.updateProgram).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", expectedVersion: 1, title: "جدید" }));
  });

  it("rejects get without view_workflow", async () => {
    const repository = { getProgram: vi.fn(), updateProgram: vi.fn(), listPrograms: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") });
    const response = await handleProgramRequest(
      request("GET"),
      { params: Promise.resolve({ id: "p1" }) },
      deps({ repository: repository as never, requirePermission: requirePermission as never }),
    );
    expect(response.status).toBe(401);
    expect(repository.getProgram).not.toHaveBeenCalled();
  });

  it("gets program successfully", async () => {
    const repository = {
      getProgram: vi.fn().mockResolvedValue({ id: "p1", title: "a", version: 1 }),
      updateProgram: vi.fn(),
      listPrograms: vi.fn(),
    };
    const response = await handleProgramRequest(
      request("GET"),
      { params: Promise.resolve({ id: "p1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe("p1");
  });

  it("deletes program with version check and returns 409 on conflict", async () => {
    const repository = {
      getProgram: vi.fn().mockResolvedValue({ id: "p1", title: "a", version: 2 }),
      updateProgram: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }),
      listPrograms: vi.fn(),
    };
    const response = await handleProgramRequest(
      request("DELETE", { expectedVersion: 1 }),
      { params: Promise.resolve({ id: "p1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
  });

  it("returns 422 for delete without expectedVersion", async () => {
    const repository = {
      getProgram: vi.fn().mockResolvedValue({ id: "p1", title: "a", version: 1 }),
      updateProgram: vi.fn(),
      listPrograms: vi.fn(),
    };
    const response = await handleProgramRequest(
      request("DELETE", {}),
      { params: Promise.resolve({ id: "p1" }) },
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.updateProgram).not.toHaveBeenCalled();
  });
});
