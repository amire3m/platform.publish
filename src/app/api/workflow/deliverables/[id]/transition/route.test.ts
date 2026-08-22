import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleDeliverableTransitionRequest, type DeliverableTransitionDependencies } from "./route";

function makeDeps(overrides: Partial<DeliverableTransitionDependencies> & { user?: unknown } = {}): DeliverableTransitionDependencies {
  const user = overrides.user !== undefined ? overrides.user : { id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] };
  const getCurrentUser = vi.fn().mockResolvedValue(user);
  return {
    getCurrentUser: overrides.getCurrentUser ?? (getCurrentUser as never),
    repository: overrides.repository ?? {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready_for_review", assigneeUserId: "u1", version: 1 }),
      transitionDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "changes_requested", version: 2 }),
    },
  } as unknown as DeliverableTransitionDependencies;
}

describe("POST /api/workflow/deliverables/:id/transition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 422 REASON_REQUIRED when reason missing and does not call repository", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready_for_review", assigneeUserId: "u1", version: 1 }),
      transitionDeliverable: vi.fn(),
    };
    const response = await handleDeliverableTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "request_changes", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(repository.transitionDeliverable).not.toHaveBeenCalled();
  });

  it("returns 409 INVALID_TRANSITION when state-machine rejects and maps correctly", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "not_started", assigneeUserId: "u1", version: 1 }),
      transitionDeliverable: vi.fn().mockRejectedValue({ code: "INVALID_TRANSITION", message: "این گذار وضعیت مجاز نیست." }),
    };
    const response = await handleDeliverableTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "approve", expectedVersion: 1, reason: "دلیل" }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("INVALID_TRANSITION");
  });

  it("denies assignee executing manager-only action and does not call repository", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready_for_review", assigneeUserId: "u2", version: 1 }),
      transitionDeliverable: vi.fn(),
    };
    const response = await handleDeliverableTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "approve", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({
        user: { id: "u2", role: "editor", allowedActions: ["update_assigned_deliverables"], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(403);
    expect(repository.transitionDeliverable).not.toHaveBeenCalled();
  });

  it("allows assignee to execute start on their own deliverable", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "not_started", assigneeUserId: "u2", version: 1 }),
      transitionDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "in_progress", version: 2 }),
    };
    const response = await handleDeliverableTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "start", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({
        user: { id: "u2", role: "editor", allowedActions: ["update_assigned_deliverables"], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(200);
    expect(repository.transitionDeliverable).toHaveBeenCalledWith(expect.objectContaining({ action: "start", actor: "assignee" }));
  });

  it("denies assignee start on deliverable not assigned to them", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "not_started", assigneeUserId: "u1", version: 1 }),
      transitionDeliverable: vi.fn(),
    };
    const response = await handleDeliverableTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "start", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({
        user: { id: "u2", role: "editor", allowedActions: ["update_assigned_deliverables"], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(403);
    expect(repository.transitionDeliverable).not.toHaveBeenCalled();
  });

  it("returns 409 VERSION_CONFLICT on stale version", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready_for_review", assigneeUserId: "u1", version: 2 }),
      transitionDeliverable: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }),
    };
    const response = await handleDeliverableTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "approve", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("VERSION_CONFLICT");
  });

  it("returns 422 VALIDATION_ERROR for invalid action", async () => {
    const repository = { getDeliverable: vi.fn(), transitionDeliverable: vi.fn() };
    const response = await handleDeliverableTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "invalid", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.transitionDeliverable).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated and does not call repository", async () => {
    const repository = { getDeliverable: vi.fn(), transitionDeliverable: vi.fn() };
    const getCurrentUser = vi.fn().mockResolvedValue(null);
    const response = await handleDeliverableTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "start", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      { getCurrentUser: getCurrentUser as never, repository: repository as never },
    );
    expect(response.status).toBe(401);
    expect(repository.transitionDeliverable).not.toHaveBeenCalled();
  });

  it("succeeds manager approve with reason and expectedVersion", async () => {
    const repository = {
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready_for_review", assigneeUserId: "u1", version: 1 }),
      transitionDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready", version: 2 }),
    };
    const response = await handleDeliverableTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "approve", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WDL-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
  });
});
