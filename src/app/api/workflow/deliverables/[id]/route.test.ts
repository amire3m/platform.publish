import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleDeliverableRequest, type DeliverableRouteDependencies } from "./route";

function makeDeps(overrides: Partial<DeliverableRouteDependencies> & { user?: unknown } = {}): DeliverableRouteDependencies {
  const user = overrides.user !== undefined ? overrides.user : { id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] };
  const getCurrentUser = vi.fn().mockResolvedValue(user);
  return {
    getCurrentUser: overrides.getCurrentUser ?? (getCurrentUser as never),
    repository: overrides.repository ?? {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", name: "ویدیو", assigneeUserId: "u1", version: 1 }),
      updateDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", name: "جدید", version: 2 }),
      getPublication: vi.fn(),
    },
  } as unknown as DeliverableRouteDependencies;
}

describe("GET/PATCH /api/workflow/deliverables/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows assignee to update only their deliverable", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", assigneeUserId: "u2", version: 1 }),
      updateDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", name: "ok", version: 2 }),
      getPublication: vi.fn(),
    };
    const response = await handleDeliverableRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ name: "ok", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({
        user: { id: "u2", role: "editor", allowedActions: ["update_assigned_deliverables"], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(200);
    expect(repository.updateDeliverable).toHaveBeenCalled();
  });

  it("denies assignee updating a deliverable not assigned to them and does not call repository update", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", assigneeUserId: "u1", version: 1 }),
      updateDeliverable: vi.fn(),
      getPublication: vi.fn(),
    };
    const response = await handleDeliverableRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ name: "ok", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({
        user: { id: "u2", role: "editor", allowedActions: ["update_assigned_deliverables"], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(403);
    expect(repository.updateDeliverable).not.toHaveBeenCalled();
  });

  it("denies update without any permission and does not call repository", async () => {
    const repository = { getDeliverable: vi.fn(), updateDeliverable: vi.fn(), getPublication: vi.fn() };
    const response = await handleDeliverableRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ name: "ok", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({
        user: { id: "u1", role: "viewer", allowedActions: [], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(403);
    expect(repository.updateDeliverable).not.toHaveBeenCalled();
    expect(repository.getDeliverable).not.toHaveBeenCalled();
  });

  it("returns 422 for missing expectedVersion and does not call update", async () => {
    const repository = { getDeliverable: vi.fn(), updateDeliverable: vi.fn(), getPublication: vi.fn() };
    const response = await handleDeliverableRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ name: "ok" }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.updateDeliverable).not.toHaveBeenCalled();
  });

  it("returns 409 for version conflict", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", assigneeUserId: null, version: 2 }),
      updateDeliverable: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }),
      getPublication: vi.fn(),
    };
    const response = await handleDeliverableRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ name: "ok", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("VERSION_CONFLICT");
  });

  it("allows manager to update any deliverable", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", assigneeUserId: "other", version: 1 }),
      updateDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", name: "ok", version: 2 }),
      getPublication: vi.fn(),
    };
    const response = await handleDeliverableRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ name: "ok", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({ repository: repository as never }), // default manager
    );
    expect(response.status).toBe(200);
    expect(repository.updateDeliverable).toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated and does not call repository", async () => {
    const repository = { getDeliverable: vi.fn(), updateDeliverable: vi.fn(), getPublication: vi.fn() };
    const getCurrentUser = vi.fn().mockResolvedValue(null);
    const response = await handleDeliverableRequest(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ name: "ok", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      { getCurrentUser: getCurrentUser as never, repository: repository as never },
    );
    expect(response.status).toBe(401);
    expect(repository.getDeliverable).not.toHaveBeenCalled();
    expect(repository.updateDeliverable).not.toHaveBeenCalled();
  });

  it("gets deliverable with view_workflow", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", name: "ویدیو" }),
      updateDeliverable: vi.fn(),
      getPublication: vi.fn(),
    };
    const response = await handleDeliverableRequest(
      new Request("http://test", { method: "GET" }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({
        user: { id: "u1", role: "viewer", allowedActions: ["view_workflow"], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    // viewer with view_workflow should be allowed (viewer has view_workflow by default)
    expect(response.status).toBe(200);
  });
});
