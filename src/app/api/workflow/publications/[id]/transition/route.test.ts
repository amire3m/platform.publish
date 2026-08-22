import { describe, expect, it, vi, beforeEach } from "vitest";
import { handlePublicationTransitionRequest, type PublicationTransitionDependencies } from "./route";

function makeDeps(overrides: Partial<PublicationTransitionDependencies> & { user?: unknown } = {}): PublicationTransitionDependencies {
  const user = overrides.user !== undefined ? overrides.user : { id: "u1", role: "publisher", allowedActions: ["manage_publications"], allowedAccountIds: ["acc1"] };
  const getCurrentUser = vi.fn().mockResolvedValue(user);
  return {
    getCurrentUser: overrides.getCurrentUser ?? (getCurrentUser as never),
    repository: overrides.repository ?? {
      getPublication: vi.fn().mockResolvedValue({ id: "WPB-1", deliverableId: "WDL-1", platform: "youtube", socialAccountId: "acc1", status: "ready", version: 1, terminalOwner: null }),
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready" }),
      transitionPublication: vi.fn().mockResolvedValue({ id: "WPB-1", status: "scheduled", version: 2 }),
    },
  } as unknown as PublicationTransitionDependencies;
}

describe("POST /api/workflow/publications/:id/transition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies publisher outside account scope and does not call repository transition", async () => {
    const repository = {
      getPublication: vi.fn().mockResolvedValue({ id: "WPB-1", deliverableId: "WDL-1", platform: "youtube", socialAccountId: "acc2", status: "ready", version: 1, terminalOwner: null }),
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready" }),
      transitionPublication: vi.fn(),
    };
    const response = await handlePublicationTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "schedule", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WPB-1" }) },
      makeDeps({
        user: { id: "u1", role: "publisher", allowedActions: ["manage_publications"], allowedAccountIds: ["acc1"] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(403);
    expect(repository.transitionPublication).not.toHaveBeenCalled();
  });

  it("returns 422 REASON_REQUIRED for suppress without reason and does not call repository", async () => {
    const repository = {
      getPublication: vi.fn().mockResolvedValue({ id: "WPB-1", deliverableId: "WDL-1", platform: "youtube", socialAccountId: "acc1", status: "ready", version: 1, terminalOwner: null }),
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready" }),
      transitionPublication: vi.fn(),
    };
    const response = await handlePublicationTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "suppress", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WPB-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(repository.transitionPublication).not.toHaveBeenCalled();
  });

  it("returns 409 INVALID_TRANSITION for invalid publication transition", async () => {
    const repository = {
      getPublication: vi.fn().mockResolvedValue({ id: "WPB-1", deliverableId: "WDL-1", platform: "youtube", socialAccountId: "acc1", status: "waiting_for_production", version: 1, terminalOwner: null }),
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "not_started" }),
      transitionPublication: vi.fn().mockRejectedValue({ code: "INVALID_TRANSITION", message: "این گذار وضعیت مجاز نیست." }),
    };
    const response = await handlePublicationTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "schedule", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WPB-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("INVALID_TRANSITION");
  });

  it("allows publisher within account scope to schedule", async () => {
    const repository = {
      getPublication: vi.fn().mockResolvedValue({ id: "WPB-1", deliverableId: "WDL-1", platform: "youtube", socialAccountId: "acc1", status: "ready", version: 1, terminalOwner: null }),
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready" }),
      transitionPublication: vi.fn().mockResolvedValue({ id: "WPB-1", status: "scheduled", version: 2 }),
    };
    const response = await handlePublicationTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "schedule", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WPB-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    expect(repository.transitionPublication).toHaveBeenCalled();
  });

  it("denies publisher for manager-only restore_suppressed", async () => {
    const repository = {
      getPublication: vi.fn().mockResolvedValue({ id: "WPB-1", deliverableId: "WDL-1", platform: "youtube", socialAccountId: "acc1", status: "do_not_publish", version: 1, terminalOwner: "manual" }),
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready" }),
      transitionPublication: vi.fn(),
    };
    const response = await handlePublicationTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "restore_suppressed", expectedVersion: 1, reason: "دلیل" }) }),
      { params: Promise.resolve({ id: "WPB-1" }) },
      makeDeps({
        user: { id: "u1", role: "publisher", allowedActions: ["manage_publications"], allowedAccountIds: ["acc1"] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(403);
    expect(repository.transitionPublication).not.toHaveBeenCalled();
  });

  it("allows manager to restore_suppressed", async () => {
    const repository = {
      getPublication: vi.fn().mockResolvedValue({ id: "WPB-1", deliverableId: "WDL-1", platform: "youtube", socialAccountId: "acc1", status: "do_not_publish", version: 1, terminalOwner: "manual" }),
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready" }),
      transitionPublication: vi.fn().mockResolvedValue({ id: "WPB-1", status: "ready", version: 2 }),
    };
    const response = await handlePublicationTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "restore_suppressed", expectedVersion: 1, reason: "دلیل" }) }),
      { params: Promise.resolve({ id: "WPB-1" }) },
      makeDeps({
        user: { id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns 401 when unauthenticated and does not call repository", async () => {
    const repository = { getPublication: vi.fn(), getDeliverable: vi.fn(), transitionPublication: vi.fn() };
    const getCurrentUser = vi.fn().mockResolvedValue(null);
    const response = await handlePublicationTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "schedule", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WPB-1" }) },
      { getCurrentUser: getCurrentUser as never, repository: repository as never },
    );
    expect(response.status).toBe(401);
    expect(repository.transitionPublication).not.toHaveBeenCalled();
  });

  it("returns 409 VERSION_CONFLICT on stale version", async () => {
    const repository = {
      getPublication: vi.fn().mockResolvedValue({ id: "WPB-1", deliverableId: "WDL-1", platform: "youtube", socialAccountId: "acc1", status: "ready", version: 2, terminalOwner: null }),
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready" }),
      transitionPublication: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }),
    };
    const response = await handlePublicationTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "schedule", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WPB-1" }) },
      makeDeps({ repository: repository as never }),
    );
    expect(response.status).toBe(409);
  });

  it("handles accountless Telegram publication with manage_publications", async () => {
    const repository = {
      getPublication: vi.fn().mockResolvedValue({ id: "WPB-1", deliverableId: "WDL-1", platform: "telegram", socialAccountId: null, status: "ready", version: 1, terminalOwner: null }),
      getDeliverable: vi.fn().mockResolvedValue({ id: "WDL-1", productionStatus: "ready" }),
      transitionPublication: vi.fn().mockResolvedValue({ id: "WPB-1", status: "scheduled", version: 2 }),
    };
    const response = await handlePublicationTransitionRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ action: "schedule", expectedVersion: 1 }) }),
      { params: Promise.resolve({ id: "WPB-1" }) },
      makeDeps({
        user: { id: "u1", role: "publisher", allowedActions: ["manage_publications"], allowedAccountIds: ["acc1"] },
        repository: repository as never,
      }),
    );
    expect(response.status).toBe(200);
  });
});
