import { describe, expect, it, vi, beforeEach } from "vitest";
import { TaskRepositoryError } from "@/lib/task-board/repository";
import { handleTaskApproveRequest, type TaskApproveRouteDependencies } from "./[id]/approve/route";
import { handleTaskReturnRequest, type TaskReturnRouteDependencies } from "./[id]/return/route";
import { handleTaskArchiveRequest, type TaskArchiveRouteDependencies } from "./[id]/archive/route";
import { handleTaskSubmitRequest, type TaskSubmitRouteDependencies } from "./[id]/assignments/[jobFunction]/submit/route";

const ownerUser = {
  id: "u-owner",
  role: "owner",
  active: true,
  jobFunctions: [],
  allowedChannels: [],
};

function ctx(id = "TSK-1"): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function submitCtx(id = "TSK-1", jobFunction = "graphic"): { params: Promise<{ id: string; jobFunction: string }> } {
  return { params: Promise.resolve({ id, jobFunction }) };
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("task mutation actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps stale approval to 409", async () => {
    const repository = {
      approveTask: vi.fn().mockRejectedValue(new TaskRepositoryError("VERSION_CONFLICT", "stale")),
    };
    const response = await handleTaskApproveRequest(jsonRequest("http://test/approve", { expectedVersion: 1 }), ctx(), {
      getCurrentUser: vi.fn().mockResolvedValue(ownerUser) as never,
      repository: repository as never,
    } as TaskApproveRouteDependencies);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
  });

  it("rejects approval without ownership as 403", async () => {
    const repository = {
      approveTask: vi.fn().mockRejectedValue(new TaskRepositoryError("FORBIDDEN", "no")),
    };
    const response = await handleTaskApproveRequest(jsonRequest("http://test/approve", { expectedVersion: 2 }), ctx(), {
      getCurrentUser: vi.fn().mockResolvedValue(ownerUser) as never,
      repository: repository as never,
    } as TaskApproveRouteDependencies);
    expect(response.status).toBe(403);
  });

  it("approves a fully submitted task", async () => {
    const repository = { approveTask: vi.fn().mockResolvedValue({ id: "TSK-1", status: "completed", version: 4 }) };
    const response = await handleTaskApproveRequest(jsonRequest("http://test/approve", { expectedVersion: 3 }), ctx(), {
      getCurrentUser: vi.fn().mockResolvedValue(ownerUser) as never,
      repository: repository as never,
    } as TaskApproveRouteDependencies);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ status: "completed", version: 4 });
  });

  it("requires a reason when returning assignments", async () => {
    const repository = { returnAssignments: vi.fn() };
    const response = await handleTaskReturnRequest(
      jsonRequest("http://test/return", { expectedVersion: 3, jobFunctions: ["graphic"], reason: "" }),
      ctx(),
      {
        getCurrentUser: vi.fn().mockResolvedValue(ownerUser) as never,
        repository: repository as never,
      } as TaskReturnRouteDependencies,
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("دلیل برگشت را وارد کنید.");
    expect(repository.returnAssignments).not.toHaveBeenCalled();
  });

  it("returns selected assignments", async () => {
    const repository = { returnAssignments: vi.fn().mockResolvedValue({ id: "TSK-1", status: "open", version: 4 }) };
    const response = await handleTaskReturnRequest(
      jsonRequest("http://test/return", { expectedVersion: 3, jobFunctions: ["graphic"], reason: "fix" }),
      ctx(),
      {
        getCurrentUser: vi.fn().mockResolvedValue(ownerUser) as never,
        repository: repository as never,
      } as TaskReturnRouteDependencies,
    );
    expect(response.status).toBe(200);
    expect(repository.returnAssignments).toHaveBeenCalledWith(expect.objectContaining({ reason: "fix" }));
  });

  it("archives a task", async () => {
    const repository = { archiveTask: vi.fn().mockResolvedValue({ id: "TSK-1", status: "archived", version: 5 }) };
    const response = await handleTaskArchiveRequest(jsonRequest("http://test/archive", { expectedVersion: 4 }), ctx(), {
      getCurrentUser: vi.fn().mockResolvedValue(ownerUser) as never,
      repository: repository as never,
    } as TaskArchiveRouteDependencies);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ status: "archived" });
  });

  it("rejects submission by users outside the assigned function as 403", async () => {
    const repository = {
      submitAssignment: vi.fn().mockRejectedValue(new TaskRepositoryError("FORBIDDEN", "no")),
    };
    const member = { id: "u1", role: "editor", active: true, jobFunctions: ["reel_editor"], allowedChannels: [] };
    const response = await handleTaskSubmitRequest(
      jsonRequest("http://test/submit", { expectedVersion: 1, submissionNote: "done" }),
      submitCtx(),
      {
        getCurrentUser: vi.fn().mockResolvedValue(member) as never,
        repository: repository as never,
      } as TaskSubmitRouteDependencies,
    );
    expect(response.status).toBe(403);
  });

  it("rejects an invalid job function as 422", async () => {
    const repository = { submitAssignment: vi.fn() };
    const response = await handleTaskSubmitRequest(
      jsonRequest("http://test/submit", { expectedVersion: 1 }),
      submitCtx("TSK-1", "invalid"),
      {
        getCurrentUser: vi.fn().mockResolvedValue(ownerUser) as never,
        repository: repository as never,
      } as TaskSubmitRouteDependencies,
    );
    expect(response.status).toBe(422);
    expect(repository.submitAssignment).not.toHaveBeenCalled();
  });

  it("submits an assignment", async () => {
    const repository = {
      submitAssignment: vi.fn().mockResolvedValue({ id: "TSK-1", status: "open", version: 2 }),
    };
    const member = { id: "u2", role: "editor", active: true, jobFunctions: ["graphic"], allowedChannels: [] };
    const response = await handleTaskSubmitRequest(
      jsonRequest("http://test/submit", { expectedVersion: 1, submissionNote: "done" }),
      submitCtx(),
      {
        getCurrentUser: vi.fn().mockResolvedValue(member) as never,
        repository: repository as never,
      } as TaskSubmitRouteDependencies,
    );
    expect(response.status).toBe(200);
    expect(repository.submitAssignment).toHaveBeenCalledWith(expect.objectContaining({ jobFunction: "graphic" }));
  });
});

