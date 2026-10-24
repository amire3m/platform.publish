import { describe, expect, it, vi, beforeEach } from "vitest";
import { TaskRepositoryError } from "@/lib/task-board/repository";
import { handleTaskDetailRequest, type TaskDetailRouteDependencies } from "./route";

const ownerUser = {
  id: "u-owner",
  role: "owner",
  active: true,
  jobFunctions: [],
  allowedChannels: [],
};

function deps(overrides: Partial<TaskDetailRouteDependencies> & { user?: unknown } = {}): TaskDetailRouteDependencies {
  const user = overrides.user !== undefined ? overrides.user : ownerUser;
  return {
    getCurrentUser: vi.fn().mockResolvedValue(user) as never,
    repository: (overrides.repository ?? {
      getTask: vi.fn().mockResolvedValue({ id: "TSK-1", title: "کار", version: 1 }),
      updateTask: vi.fn().mockResolvedValue({ id: "TSK-1", title: "کار", version: 2 }),
    }) as never,
  } as unknown as TaskDetailRouteDependencies;
}

function ctx(id = "TSK-1405-000001"): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET/PATCH /api/tasks/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides an inaccessible task as 404", async () => {
    const repository = { getTask: vi.fn().mockResolvedValue(null), updateTask: vi.fn() };
    const response = await handleTaskDetailRequest(
      new Request("http://test/api/tasks/TSK-1", { method: "GET" }),
      ctx("TSK-1"),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("returns task detail for authorized users", async () => {
    const detail = { id: "TSK-1", title: "کار", version: 1 };
    const repository = { getTask: vi.fn().mockResolvedValue(detail), updateTask: vi.fn() };
    const response = await handleTaskDetailRequest(
      new Request("http://test/api/tasks/TSK-1", { method: "GET" }),
      ctx("TSK-1"),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ id: "TSK-1" });
    expect(repository.getTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: "TSK-1" }));
  });

  it("returns 422 with the first Persian issue for an empty title", async () => {
    const repository = { getTask: vi.fn(), updateTask: vi.fn() };
    const response = await handleTaskDetailRequest(
      new Request("http://test/api/tasks/TSK-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "", expectedVersion: 1 }),
      }),
      ctx("TSK-1"),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("عنوان کار را وارد کنید.");
    expect(repository.updateTask).not.toHaveBeenCalled();
  });

  it("maps stale mutations to 409", async () => {
    const repository = {
      getTask: vi.fn(),
      updateTask: vi.fn().mockRejectedValue(new TaskRepositoryError("VERSION_CONFLICT", "stale")),
    };
    const response = await handleTaskDetailRequest(
      new Request("http://test/api/tasks/TSK-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "new", expectedVersion: 1 }),
      }),
      ctx("TSK-1"),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
  });

  it("maps completed edits to 409 INVALID_TRANSITION", async () => {
    const repository = {
      getTask: vi.fn(),
      updateTask: vi.fn().mockRejectedValue(new TaskRepositoryError("INVALID_TRANSITION", "locked")),
    };
    const response = await handleTaskDetailRequest(
      new Request("http://test/api/tasks/TSK-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "new", expectedVersion: 2 }),
      }),
      ctx("TSK-1"),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
  });

  it("maps invalid content links to 422", async () => {
    const repository = {
      getTask: vi.fn(),
      updateTask: vi.fn().mockRejectedValue(new TaskRepositoryError("INVALID_LINK", "bad link")),
    };
    const response = await handleTaskDetailRequest(
      new Request("http://test/api/tasks/TSK-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: "CPR-1", expectedVersion: 2 }),
      }),
      ctx("TSK-1"),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "INVALID_LINK" });
  });

  it("returns 422 for malformed JSON", async () => {
    const repository = { getTask: vi.fn(), updateTask: vi.fn() };
    const response = await handleTaskDetailRequest(
      new Request("http://test/api/tasks/TSK-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      ctx("TSK-1"),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.updateTask).not.toHaveBeenCalled();
  });
});

