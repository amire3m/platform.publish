import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleNotificationsRequest, type WorkflowNotificationsRouteDependencies } from "./route";

function deps(overrides: Partial<WorkflowNotificationsRouteDependencies> = {}): WorkflowNotificationsRouteDependencies {
  const requirePermission = vi.fn().mockResolvedValue({ user: { id: "u1", role: "editor" }, response: null });
  return {
    requirePermission: overrides.requirePermission ?? (requirePermission as never),
    repository: overrides.repository ?? {
      listForUser: vi.fn().mockResolvedValue([]),
      countUnread: vi.fn().mockResolvedValue(0),
      checkTaskVisibility: vi.fn().mockResolvedValue(true),
    },
  } as unknown as WorkflowNotificationsRouteDependencies;
}

function taskRow(id: string, taskId: string | null) {
  return {
    id,
    eventType: "task_created",
    payload: taskId ? { taskId, title: "cover" } : { title: "cover" },
    status: "pending",
    readAt: null,
    createdAt: new Date(),
  };
}

describe("GET /api/workflow/notifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("start", 401, "UNAUTHENTICATED") });
    const repository = { listForUser: vi.fn(), countUnread: vi.fn(), checkTaskVisibility: vi.fn() };
    const response = await handleNotificationsRequest(new Request("http://test/api/workflow/notifications"), {
      requirePermission: requirePermission as never,
      repository: repository as never,
    });
    expect(response.status).toBe(401);
    expect(repository.listForUser).not.toHaveBeenCalled();
  });

  it("removes task rows the user can no longer view", async () => {
    const visible = taskRow("WNT-1", "TSK-1");
    const hidden = taskRow("WNT-2", "TSK-2");
    const workflow = { id: "WNT-3", eventType: "assignment", payload: { title: "x" }, status: "pending", readAt: null, createdAt: new Date() };
    const repository = {
      listForUser: vi.fn().mockResolvedValue([visible, hidden, workflow]),
      countUnread: vi.fn().mockResolvedValue(2),
      checkTaskVisibility: vi.fn().mockImplementation(async (_actor: unknown, row: { payload: Record<string, unknown> }) => row.payload.taskId !== "TSK-2"),
    };
    const response = await handleNotificationsRequest(
      new Request("http://test/api/workflow/notifications"),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items.map((item: { id: string }) => item.id).sort()).toEqual(["WNT-1", "WNT-3"]);
    expect(body.data.unreadCount).toBe(2);
  });

  it("hides task rows without a task link", async () => {
    const repository = {
      listForUser: vi.fn().mockResolvedValue([taskRow("WNT-9", null)]),
      countUnread: vi.fn().mockResolvedValue(1),
      checkTaskVisibility: vi.fn().mockResolvedValue(false),
    };
    const response = await handleNotificationsRequest(
      new Request("http://test/api/workflow/notifications"),
      deps({ repository: repository as never }),
    );
    const body = await response.json();
    expect(body.data.items).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  it("builds board links for visible task rows", async () => {
    const repository = {
      listForUser: vi.fn().mockResolvedValue([taskRow("WNT-1", "TSK-1")]),
      countUnread: vi.fn().mockResolvedValue(1),
      checkTaskVisibility: vi.fn().mockResolvedValue(true),
    };
    const response = await handleNotificationsRequest(
      new Request("http://test/api/workflow/notifications"),
      deps({ repository: repository as never }),
    );
    const body = await response.json();
    expect(body.data.items[0].links).toMatchObject({ task: "/tasks?task=TSK-1" });
  });

  it("passes unreadOnly filtering to the repository", async () => {
    const repository = {
      listForUser: vi.fn().mockResolvedValue([]),
      countUnread: vi.fn().mockResolvedValue(0),
      checkTaskVisibility: vi.fn(),
    };
    await handleNotificationsRequest(
      new Request("http://test/api/workflow/notifications?unreadOnly=true&limit=10"),
      deps({ repository: repository as never }),
    );
    expect(repository.listForUser).toHaveBeenCalledWith("u1", expect.objectContaining({ unreadOnly: true, limit: 10 }));
  });
});

