import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { TaskRepositoryError } from "@/lib/task-board/repository";
import { handleTasksRequest, type TasksRouteDependencies } from "./route";

const ownerUser = {
  id: "u-owner",
  role: "owner",
  active: true,
  jobFunctions: [],
  allowedChannels: [],
};

function deps(overrides: Partial<TasksRouteDependencies> & { user?: unknown } = {}): TasksRouteDependencies {
  const user = overrides.user !== undefined ? overrides.user : ownerUser;
  const getCurrentUser = vi.fn().mockResolvedValue(user);
  return {
    getCurrentUser: getCurrentUser as never,
    repository: (overrides.repository ?? {
      listTasks: vi.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
      createTask: vi.fn().mockResolvedValue({ id: "TSK-1405-000001", title: "کار تست", version: 1 }),
    }) as never,
  } as unknown as TasksRouteDependencies;
}

function postRequest(body: unknown): Request {
  return new Request("http://test/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET/POST /api/tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects listing when unauthenticated and does not call repository", async () => {
    const repository = { listTasks: vi.fn(), createTask: vi.fn() };
    const response = await handleTasksRequest(new Request("http://test/api/tasks?column=open", { method: "GET" }), {
      getCurrentUser: vi.fn().mockResolvedValue(null) as never,
      repository: repository as never,
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(repository.listTasks).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid column without calling repository", async () => {
    const repository = { listTasks: vi.fn(), createTask: vi.fn() };
    const response = await handleTasksRequest(
      new Request("http://test/api/tasks?column=invalid", { method: "GET" }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repository.listTasks).not.toHaveBeenCalled();
  });

  it("lists open tasks with default limit", async () => {
    const repository = {
      listTasks: vi.fn().mockResolvedValue({ items: [{ id: "TSK-1" }], nextCursor: "cur", total: 1 }),
      createTask: vi.fn(),
    };
    const response = await handleTasksRequest(
      new Request("http://test/api/tasks?column=open", { method: "GET" }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.total).toBe(1);
    expect(body.data.nextCursor).toBe("cur");
    expect(repository.listTasks).toHaveBeenCalledWith(expect.objectContaining({ column: "open", limit: 50 }));
  });

  it("rejects archived listing for non-owners with 403", async () => {
    const repository = {
      listTasks: vi.fn().mockRejectedValue(new TaskRepositoryError("FORBIDDEN", "only owner")),
      createTask: vi.fn(),
    };
    const response = await handleTasksRequest(
      new Request("http://test/api/tasks?column=archived", { method: "GET" }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("returns 422 with the first Persian issue for an empty title", async () => {
    const repository = { listTasks: vi.fn(), createTask: vi.fn() };
    const response = await handleTasksRequest(postRequest({ title: "", jobFunctions: ["graphic"] }), deps({ repository: repository as never }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toBe("عنوان کار را وارد کنید.");
    expect(repository.createTask).not.toHaveBeenCalled();
  });

  it("returns 422 for malformed JSON without calling repository", async () => {
    const repository = { listTasks: vi.fn(), createTask: vi.fn() };
    const response = await handleTasksRequest(postRequest("{"), deps({ repository: repository as never }));
    expect(response.status).toBe(422);
    expect(repository.createTask).not.toHaveBeenCalled();
  });

  it("maps forbidden creation to 403", async () => {
    const repository = {
      listTasks: vi.fn(),
      createTask: vi.fn().mockRejectedValue(new TaskRepositoryError("FORBIDDEN", "only owner")),
    };
    const response = await handleTasksRequest(
      postRequest({ title: "کار", jobFunctions: ["graphic"] }),
      deps({ repository: repository as never, user: { id: "u1", role: "editor", active: true, jobFunctions: ["graphic"], allowedChannels: [] } }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("maps invalid content links to 422", async () => {
    const repository = {
      listTasks: vi.fn(),
      createTask: vi.fn().mockRejectedValue(new TaskRepositoryError("INVALID_LINK", "bad link")),
    };
    const response = await handleTasksRequest(
      postRequest({ title: "کار", jobFunctions: ["graphic"], productId: "CPR-1" }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "INVALID_LINK" });
  });

  it("creates a task with 201", async () => {
    const created = { id: "TSK-1405-000001", title: "کار", version: 1 };
    const repository = { listTasks: vi.fn(), createTask: vi.fn().mockResolvedValue(created) };
    const response = await handleTasksRequest(
      postRequest({ title: "کار", jobFunctions: ["graphic"] }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toMatchObject({ id: "TSK-1405-000001", version: 1 });
    expect(repository.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "کار" }));
  });

  it("does not expose unexpected repository errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository = {
      listTasks: vi.fn().mockRejectedValue(new Error("database connection secret")),
      createTask: vi.fn(),
    };
    const response = await handleTasksRequest(
      new Request("http://test/api/tasks?column=open", { method: "GET" }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
  });
});

