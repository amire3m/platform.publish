import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleActivitiesRequest, type ActivitiesRouteDependencies } from "./route";

function makeDeps(overrides: Partial<ActivitiesRouteDependencies> & { user?: unknown } = {}): ActivitiesRouteDependencies {
  const user = overrides.user !== undefined ? overrides.user : { id: "u1", role: "manager", allowedActions: ["manage_content_room"], allowedAccountIds: [] };
  const getCurrentUser = vi.fn().mockResolvedValue(user);
  const repository = {
    togglePartActivity: vi.fn().mockResolvedValue({ id: "CPP-1", partNumber: 1, isActive: true, activities: { editing_youtube: true } }),
    getPart: vi.fn(),
    getProduct: vi.fn(),
  };
  return {
    getCurrentUser: (overrides.getCurrentUser as never) ?? (getCurrentUser as never),
    repository: (overrides.repository as never) ?? (repository as never),
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/content-room/parts/CPP-1/activities", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/content-room/parts/:partId/activities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated (401)", async () => {
    const repository = { togglePartActivity: vi.fn() };
    const getCurrentUser = vi.fn().mockResolvedValue(null);
    const res = await handleActivitiesRequest(req({ activity: "editing_youtube", isDone: true, expectedProductVersion: 1 }), { params: Promise.resolve({ id: "CPP-1" }) }, {
      getCurrentUser: getCurrentUser as never,
      repository: repository as never,
    });
    expect(res.status).toBe(401);
    expect(repository.togglePartActivity).not.toHaveBeenCalled();
  });

  it("rejects without permission (403)", async () => {
    const repository = { togglePartActivity: vi.fn() };
    const res = await handleActivitiesRequest(
      req({ activity: "editing_youtube", isDone: true, expectedProductVersion: 1 }),
      { params: Promise.resolve({ id: "CPP-1" }) },
      makeDeps({ user: { id: "u2", role: "viewer", allowedActions: [], allowedAccountIds: [] }, repository: repository as never }),
    );
    expect(res.status).toBe(403);
    expect(repository.togglePartActivity).not.toHaveBeenCalled();
  });

  it("allows editor with update_assigned_content", async () => {
    const repository = { togglePartActivity: vi.fn().mockResolvedValue({ id: "CPP-1" }) };
    const res = await handleActivitiesRequest(
      req({ activity: "editing_youtube", isDone: true, expectedProductVersion: 1 }),
      { params: Promise.resolve({ id: "CPP-1" }) },
      makeDeps({ user: { id: "u2", role: "editor", allowedActions: ["update_assigned_content"], allowedAccountIds: [] }, repository: repository as never }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 422 for invalid activity", async () => {
    const deps = makeDeps();
    const res = await handleActivitiesRequest(req({ activity: "invalid_activity", isDone: true, expectedProductVersion: 1 }), { params: Promise.resolve({ id: "CPP-1" }) }, deps);
    expect(res.status).toBe(422);
    expect(deps.repository.togglePartActivity).not.toHaveBeenCalled();
  });

  it("returns 422 for missing expectedProductVersion", async () => {
    const deps = makeDeps();
    const res = await handleActivitiesRequest(req({ activity: "editing_youtube", isDone: true }), { params: Promise.resolve({ id: "CPP-1" }) }, deps);
    expect(res.status).toBe(422);
  });

  it("returns 404 for NOT_FOUND", async () => {
    const repository = { togglePartActivity: vi.fn().mockRejectedValue({ code: "NOT_FOUND", message: "قسمت یافت نشد." }) };
    const res = await handleActivitiesRequest(req({ activity: "editing_youtube", isDone: true, expectedProductVersion: 1 }), { params: Promise.resolve({ id: "CPP-missing" }) }, makeDeps({ repository: repository as never }));
    expect(res.status).toBe(404);
  });

  it("returns 409 for VERSION_CONFLICT", async () => {
    const repository = { togglePartActivity: vi.fn().mockRejectedValue({ code: "VERSION_CONFLICT", message: "نسخه قدیمی است." }) };
    const res = await handleActivitiesRequest(req({ activity: "editing_youtube", isDone: true, expectedProductVersion: 1 }), { params: Promise.resolve({ id: "CPP-1" }) }, makeDeps({ repository: repository as never }));
    expect(res.status).toBe(409);
  });

  it("returns 400 for INVALID_TRANSITION (previously_published guard)", async () => {
    const repository = { togglePartActivity: vi.fn().mockRejectedValue({ code: "INVALID_TRANSITION", message: "قسمت قبلاً منتشر شده است." }) };
    const res = await handleActivitiesRequest(req({ activity: "cover_ready", isDone: true, expectedProductVersion: 1 }), { params: Promise.resolve({ id: "CPP-1" }) }, makeDeps({ repository: repository as never }));
    expect(res.status).toBe(400);
  });

  it("toggles previously_published successfully", async () => {
    const repository = { togglePartActivity: vi.fn().mockResolvedValue({ id: "CPP-1", activities: { previously_published: true } }) };
    const res = await handleActivitiesRequest(req({ activity: "previously_published", isDone: true, expectedProductVersion: 1 }), { params: Promise.resolve({ id: "CPP-1" }) }, makeDeps({ repository: repository as never }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("CPP-1");
    expect(repository.togglePartActivity).toHaveBeenCalledWith(expect.objectContaining({ id: "CPP-1", activity: "previously_published", isDone: true }));
  });

  it("toggles activity successfully", async () => {
    const deps = makeDeps();
    const res = await handleActivitiesRequest(req({ activity: "editing_youtube", isDone: true, expectedProductVersion: 2 }), { params: Promise.resolve({ id: "CPP-1" }) }, deps);
    expect(res.status).toBe(200);
    expect(deps.repository.togglePartActivity).toHaveBeenCalledWith(expect.objectContaining({ expectedProductVersion: 2, isDone: true }));
  });

  it("returns 422 for malformed JSON", async () => {
    const deps = makeDeps();
    const request = new Request("http://localhost/api/content-room/parts/CPP-1/activities", { method: "PATCH", body: "not-json", headers: { "content-type": "application/json" } });
    const res = await handleActivitiesRequest(request, { params: Promise.resolve({ id: "CPP-1" }) }, deps);
    expect(res.status).toBe(422);
  });
});
