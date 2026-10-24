import { beforeEach, describe, expect, it } from "vitest";

import type { TaskActor } from "./types";
import { createTaskRepository, InMemoryTaskPort } from "./repository";

const owner: TaskActor = {
  id: "USR-OWNER",
  role: "owner",
  active: true,
  jobFunctions: [],
  allowedChannels: [],
};
const graphicUser: TaskActor = {
  id: "USR-GRAPHIC",
  role: "editor",
  active: true,
  jobFunctions: ["graphic"],
  allowedChannels: [],
};
const publisherUser: TaskActor = {
  id: "USR-PUBLISHER",
  role: "editor",
  active: true,
  jobFunctions: ["publisher_admin"],
  allowedChannels: [],
};

describe("manual task repository", () => {
  let port: InMemoryTaskPort;
  let repository: ReturnType<typeof createTaskRepository>;

  beforeEach(() => {
    port = new InMemoryTaskPort({
      now: new Date("2026-10-24T08:00:00.000Z"),
      actors: [owner, graphicUser, publisherUser],
    });
    repository = createTaskRepository(port);
  });

  async function createMultiFunctionTask() {
    return repository.createTask({
      actor: owner,
      title: "آماده‌سازی قسمت پنجم",
      description: null,
      dueAt: null,
      productId: null,
      partId: null,
      jobFunctions: ["graphic", "publisher_admin"],
    });
  }

  it("creates a shared task, audit event, and deduplicated recipient notifications atomically", async () => {
    const task = await createMultiFunctionTask();

    expect(task.status).toBe("open");
    expect(task.assignments.map((assignment) => assignment.jobFunction)).toEqual(["graphic", "publisher_admin"]);
    expect(port.events).toMatchObject([{ entityType: "task", action: "task_created" }]);
    expect(port.notifications.map((notification) => notification.recipientUserId).sort()).toEqual([
      "USR-GRAPHIC",
      "USR-PUBLISHER",
    ]);
  });

  it("moves to approval only after the final function submits", async () => {
    const task = await createMultiFunctionTask();

    const afterGraphic = await repository.submitAssignment({
      actor: graphicUser,
      taskId: task.id,
      jobFunction: "graphic",
      expectedVersion: 1,
      submissionNote: "کاور آماده شد",
      submissionUrl: "https://example.com/cover",
    });
    expect(afterGraphic.status).toBe("open");
    expect(afterGraphic.version).toBe(2);

    const afterPublisher = await repository.submitAssignment({
      actor: publisherUser,
      taskId: task.id,
      jobFunction: "publisher_admin",
      expectedVersion: 2,
      submissionNote: null,
      submissionUrl: null,
    });
    expect(afterPublisher.status).toBe("awaiting_approval");
    expect(afterPublisher.awaitingApprovalAt).toEqual(new Date("2026-10-24T08:00:00.000Z"));
    expect(afterPublisher.version).toBe(3);
  });

  it("returns an early submission without discarding other assignment state", async () => {
    const task = await createMultiFunctionTask();
    await repository.submitAssignment({
      actor: graphicUser,
      taskId: task.id,
      jobFunction: "graphic",
      expectedVersion: 1,
      submissionNote: "نسخه اول",
      submissionUrl: null,
    });

    const returned = await repository.returnAssignments({
      actor: owner,
      taskId: task.id,
      expectedVersion: 2,
      jobFunctions: ["graphic"],
      reason: "ابعاد اصلاح شود",
    });

    expect(returned.status).toBe("open");
    expect(returned.assignments.find((assignment) => assignment.jobFunction === "graphic")).toMatchObject({
      status: "open",
      submissionNote: null,
      submittedBy: null,
      submittedAt: null,
    });
    expect(port.events.filter((event) => event.action === "task_assignment_returned")).toHaveLength(1);
    expect(port.events.find((event) => event.action === "task_assignment_returned")?.before).toMatchObject({
      submissionNote: "نسخه اول",
    });
  });

  it("approves only a fully submitted task", async () => {
    const task = await createMultiFunctionTask();
    await expect(repository.approveTask({ actor: owner, taskId: task.id, expectedVersion: 1 })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });

    await repository.submitAssignment({
      actor: graphicUser,
      taskId: task.id,
      jobFunction: "graphic",
      expectedVersion: 1,
      submissionNote: null,
      submissionUrl: null,
    });
    await repository.submitAssignment({
      actor: publisherUser,
      taskId: task.id,
      jobFunction: "publisher_admin",
      expectedVersion: 2,
      submissionNote: null,
      submissionUrl: null,
    });

    const approved = await repository.approveTask({ actor: owner, taskId: task.id, expectedVersion: 3 });
    expect(approved.status).toBe("completed");
    expect(approved.completedAt).toEqual(new Date("2026-10-24T08:00:00.000Z"));
  });

  it("rejects stale versions without partial state, events, or notifications", async () => {
    const task = await createMultiFunctionTask();
    const before = port.snapshot();

    await expect(
      repository.submitAssignment({
        actor: graphicUser,
        taskId: task.id,
        jobFunction: "graphic",
        expectedVersion: 9,
        submissionNote: null,
        submissionUrl: null,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    expect(port.snapshot()).toEqual(before);
  });

  it("rejects submission by a user outside the assigned function", async () => {
    const task = await createMultiFunctionTask();

    await expect(
      repository.submitAssignment({
        actor: publisherUser,
        taskId: task.id,
        jobFunction: "graphic",
        expectedVersion: 1,
        submissionNote: null,
        submissionUrl: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("recomputes approval state when the owner removes the final open assignment", async () => {
    const task = await createMultiFunctionTask();
    await repository.submitAssignment({
      actor: graphicUser,
      taskId: task.id,
      jobFunction: "graphic",
      expectedVersion: 1,
      submissionNote: null,
      submissionUrl: null,
    });

    const updated = await repository.updateTask({
      actor: owner,
      taskId: task.id,
      expectedVersion: 2,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
      productId: task.productId,
      partId: task.partId,
      jobFunctions: ["graphic"],
    });

    expect(updated.status).toBe("awaiting_approval");
    expect(updated.assignments).toHaveLength(1);
    expect(updated.version).toBe(3);
  });

  it("does not revalidate an unchanged content link during metadata edits", async () => {
    const task = await createMultiFunctionTask();
    port.validateLink = async () => {
      throw new Error("linked product was archived later");
    };

    const updated = await repository.updateTask({
      actor: owner,
      taskId: task.id,
      expectedVersion: 1,
      title: "عنوان اصلاح‌شده",
    });

    expect(updated.title).toBe("عنوان اصلاح‌شده");
    expect(updated.version).toBe(2);
  });

  it("soft archives without deleting assignments or history", async () => {
    const task = await createMultiFunctionTask();
    const archived = await repository.archiveTask({ actor: owner, taskId: task.id, expectedVersion: 1 });

    expect(archived.status).toBe("archived");
    expect(archived.assignments).toHaveLength(2);
    expect(port.events.at(-1)?.action).toBe("task_archived");
  });

  it("enqueues due reminders on create and replaces them when the due date changes", async () => {
    const created = await repository.createTask({
      actor: owner,
      title: "کار دارای سررسید",
      description: null,
      dueAt: new Date("2026-10-25T08:00:00.000Z"),
      productId: null,
      partId: null,
      jobFunctions: ["graphic"],
    });

    const createdReminders = port.notifications.filter((row) => row.eventType === "task_due_24h");
    expect(createdReminders).toHaveLength(1);
    expect(createdReminders[0].idempotencyKey).toContain("due_24h:2026-10-25T08:00:00.000Z");

    await repository.updateTask({
      actor: owner,
      taskId: created.id,
      expectedVersion: 1,
      dueAt: new Date("2026-10-26T08:00:00.000Z"),
    });

    const oldRow = port.notifications.find(
      (row) => row.eventType === "task_due_24h" && row.idempotencyKey.includes("2026-10-25T08:00:00.000Z"),
    );
    expect(oldRow?.status).toBe("cancelled");
    const pending = port.notifications.filter((row) => row.eventType === "task_due_24h" && row.status === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].idempotencyKey).toContain("2026-10-26T08:00:00.000Z");
  });

  it("keeps reminders untouched during metadata-only edits", async () => {
    const created = await repository.createTask({
      actor: owner,
      title: "کار دارای سررسید",
      description: null,
      dueAt: new Date("2026-10-25T08:00:00.000Z"),
      productId: null,
      partId: null,
      jobFunctions: ["graphic"],
    });
    const before = port.notifications.filter((row) => row.eventType === "task_due_24h");

    await repository.updateTask({ actor: owner, taskId: created.id, expectedVersion: 1, title: "عنوان جدید" });

    const after = port.notifications.filter((row) => row.eventType === "task_due_24h");
    expect(after).toHaveLength(before.length);
    expect(after.every((row) => row.status === "pending")).toBe(true);
  });

  it("cancels only the submitted assignment reminder and clears all on completion", async () => {
    const created = await repository.createTask({
      actor: owner,
      title: "کار دارای سررسید",
      description: null,
      dueAt: new Date("2026-10-25T08:00:00.000Z"),
      productId: null,
      partId: null,
      jobFunctions: ["graphic", "publisher_admin"],
    });

    await repository.submitAssignment({
      actor: graphicUser,
      taskId: created.id,
      jobFunction: "graphic",
      expectedVersion: 1,
      submissionNote: null,
      submissionUrl: null,
    });

    const graphicRow = port.notifications.find(
      (row) => row.eventType === "task_due_24h" && row.idempotencyKey.endsWith(":graphic"),
    );
    const publisherRow = port.notifications.find(
      (row) => row.eventType === "task_due_24h" && row.idempotencyKey.endsWith(":publisher_admin"),
    );
    expect(graphicRow?.status).toBe("cancelled");
    expect(publisherRow?.status).toBe("pending");

    await repository.submitAssignment({
      actor: publisherUser,
      taskId: created.id,
      jobFunction: "publisher_admin",
      expectedVersion: 2,
      submissionNote: null,
      submissionUrl: null,
    });
    await repository.approveTask({ actor: owner, taskId: created.id, expectedVersion: 3 });

    expect(port.notifications.filter((row) => row.eventType === "task_due_24h" && row.status === "pending")).toHaveLength(0);
  });
});
