import { describe, expect, it } from "vitest";
import {
  buildTaskDue24hKey,
  buildTaskNotificationKey,
  buildTaskOverdueKey,
  buildTaskNotificationText,
  buildTaskSafePayload,
  isTaskNotificationType,
  scheduleTaskReminders,
  tehranDayString,
  validateTaskNotificationRecipient,
} from "./notifications";
import type { TaskAggregate } from "./repository";
import type { TaskActor } from "./types";

function makeActor(overrides: Partial<TaskActor> = {}): TaskActor {
  return {
    id: "u-graphic",
    role: "editor",
    active: true,
    jobFunctions: ["graphic"],
    allowedChannels: [],
    ...overrides,
  };
}

function makeAggregate(overrides: Partial<TaskAggregate> = {}): TaskAggregate {
  return {
    task: {
      id: "TSK-1405-000001",
      title: "cover",
      description: null,
      status: "open",
      dueAt: new Date("2026-10-25T08:00:00.000Z"),
      productId: null,
      partId: null,
      createdBy: "USR-OWNER",
      version: 2,
      awaitingApprovalAt: null,
      completedAt: null,
      archivedAt: null,
      createdAt: new Date("2026-10-20T08:00:00.000Z"),
      updatedAt: new Date("2026-10-24T08:00:00.000Z"),
      ...(overrides.task ?? {}),
    },
    assignments: [
      {
        taskId: "TSK-1405-000001",
        jobFunction: "graphic",
        status: "open",
        submissionNote: null,
        submissionUrl: null,
        submittedBy: null,
        submittedAt: null,
      },
    ],
    link: { productTitle: null, partNumber: null, channel: null },
    ...overrides,
  } as TaskAggregate;
}

function validationDeps(agg: TaskAggregate | null, actors: Record<string, TaskActor>) {
  return {
    getActor: async (id: string) => actors[id] ?? null,
    getTaskAggregate: async () => agg,
  };
}

describe("task notifications", () => {
  it("uses the task version in transition idempotency keys", () => {
    expect(
      buildTaskNotificationKey({ taskId: "TSK-1", event: "task_returned", version: 4, recipientUserId: "u1", jobFunction: "graphic" }),
    ).toBe("task:TSK-1:task_returned:4:u1:graphic");
    expect(
      buildTaskNotificationKey({ taskId: "TSK-1", event: "task_created", version: 1, recipientUserId: "u1" }),
    ).toBe("task:TSK-1:task_created:1:u1");
  });

  it("builds stable reminder keys", () => {
    expect(buildTaskDue24hKey("TSK-1", "2026-10-25T08:00:00.000Z", "u1", "graphic")).toBe(
      "task:TSK-1:due_24h:2026-10-25T08:00:00.000Z:u1:graphic",
    );
    expect(buildTaskOverdueKey("TSK-1", "2026-10-24", "u1", "graphic")).toBe("task:TSK-1:overdue:2026-10-24:u1:graphic");
    expect(buildTaskOverdueKey("TSK-1", "2026-10-24", "owner1", "owner")).toBe("task:TSK-1:overdue:2026-10-24:owner1:owner");
    expect(tehranDayString(new Date("2026-10-24T05:30:00.000Z"))).toBe("2026-10-24");
  });

  it("detects task event types", () => {
    expect(isTaskNotificationType("task_created")).toBe(true);
    expect(isTaskNotificationType("task_overdue")).toBe(true);
    expect(isTaskNotificationType("assignment")).toBe(false);
    expect(isTaskNotificationType("due_24h")).toBe(false);
  });

  it("keeps only safe payload fields", () => {
    const payload = buildTaskSafePayload({
      taskId: "TSK-1",
      title: "cover",
      version: 2,
      jobFunction: "graphic",
      dueAt: "2026-10-25T08:00:00.000Z",
      reason: "fix",
      description: "must not leak",
    } as never);
    expect(payload).toMatchObject({ taskId: "TSK-1", title: "cover", version: 2, jobFunction: "graphic" });
    expect(payload).not.toHaveProperty("description");
  });

  it("renders Persian text with the task title", () => {
    expect(buildTaskNotificationText("task_created", { title: "cover" })).toContain("cover");
    expect(buildTaskNotificationText("task_due_24h", { title: "cover" })).toContain("cover");
    expect(buildTaskNotificationText("task_overdue", { title: "cover" })).toContain("cover");
    expect(buildTaskNotificationText("task_returned", { title: "cover", reason: "fix" })).toContain("fix");
    expect(buildTaskNotificationText("task_approved", { title: "cover" })).toContain("cover");
  });

  it("cancels a stale reminder for a completed task", async () => {
    const agg = makeAggregate({ task: { status: "completed" } } as never);
    const deps = validationDeps(agg, { "u-graphic": makeActor() });
    const valid = await validateTaskNotificationRecipient(
      { eventType: "task_due_24h", payload: { taskId: "TSK-1405-000001", jobFunction: "graphic", dueAt: "2026-10-25T08:00:00.000Z" }, recipientUserId: "u-graphic" },
      deps,
    );
    expect(valid).toBe(false);
  });

  it("cancels a reminder when the due timestamp no longer matches", async () => {
    const deps = validationDeps(makeAggregate(), { "u-graphic": makeActor() });
    const valid = await validateTaskNotificationRecipient(
      { eventType: "task_due_24h", payload: { taskId: "TSK-1405-000001", jobFunction: "graphic", dueAt: "2026-11-01T08:00:00.000Z" }, recipientUserId: "u-graphic" },
      deps,
    );
    expect(valid).toBe(false);
  });

  it("rejects inactive recipients and missing tasks", async () => {
    const deps = validationDeps(makeAggregate(), { "u-off": makeActor({ id: "u-off", active: false }) });
    await expect(
      validateTaskNotificationRecipient(
        { eventType: "task_created", payload: { taskId: "TSK-1405-000001" }, recipientUserId: "u-off" },
        deps,
      ),
    ).resolves.toBe(false);
    const missing = validationDeps(null, { "u-graphic": makeActor() });
    await expect(
      validateTaskNotificationRecipient(
        { eventType: "task_created", payload: { taskId: "TSK-1405-000001" }, recipientUserId: "u-graphic" },
        missing,
      ),
    ).resolves.toBe(false);
  });

  it("allows submission notifications only for owners", async () => {
    const deps = validationDeps(makeAggregate(), {
      owner1: makeActor({ id: "owner1", role: "owner", jobFunctions: [] }),
      "u-graphic": makeActor(),
    });
    await expect(
      validateTaskNotificationRecipient(
        { eventType: "task_assignment_submitted", payload: { taskId: "TSK-1405-000001", jobFunction: "graphic" }, recipientUserId: "owner1" },
        deps,
      ),
    ).resolves.toBe(true);
    await expect(
      validateTaskNotificationRecipient(
        { eventType: "task_assignment_submitted", payload: { taskId: "TSK-1405-000001", jobFunction: "graphic" }, recipientUserId: "u-graphic" },
        deps,
      ),
    ).resolves.toBe(false);
  });

  it("requires a matching job function for created and returned events", async () => {
    const deps = validationDeps(makeAggregate(), {
      "u-graphic": makeActor(),
      "u-reel": makeActor({ id: "u-reel", jobFunctions: ["reel_editor"] }),
    });
    await expect(
      validateTaskNotificationRecipient(
        { eventType: "task_created", payload: { taskId: "TSK-1405-000001" }, recipientUserId: "u-graphic" },
        deps,
      ),
    ).resolves.toBe(true);
    await expect(
      validateTaskNotificationRecipient(
        { eventType: "task_created", payload: { taskId: "TSK-1405-000001" }, recipientUserId: "u-reel" },
        deps,
      ),
    ).resolves.toBe(false);
    await expect(
      validateTaskNotificationRecipient(
        { eventType: "task_returned", payload: { taskId: "TSK-1405-000001", jobFunction: "graphic" }, recipientUserId: "u-graphic" },
        deps,
      ),
    ).resolves.toBe(true);
  });

  it("enqueues a due reminder once and skips ineligible tasks", async () => {
    const dueAt = new Date("2026-10-25T08:00:00.000Z");
    const now = new Date("2026-10-24T08:00:00.000Z");
    const graphic = makeActor();
    const inserted: { idempotencyKey: string }[] = [];
    const deps = {
      listReminderCandidates: async () => [
        { taskId: "TSK-1", title: "t1", dueAt, status: "open", channel: null, openJobFunctions: ["graphic"] },
        { taskId: "TSK-2", title: "t2", dueAt: null, status: "open", channel: null, openJobFunctions: ["graphic"] },
        { taskId: "TSK-3", title: "t3", dueAt, status: "completed", channel: null, openJobFunctions: [] },
      ],
      resolveJobRecipients: async () => [graphic],
      resolveOwners: async () => [],
      insertTaskNotifications: async (rows: { idempotencyKey: string }[]) => {
        let count = 0;
        for (const row of rows) {
          if (!inserted.some((item) => item.idempotencyKey === row.idempotencyKey)) {
            inserted.push(row);
            count += 1;
          }
        }
        return count;
      },
    };
    const first = await scheduleTaskReminders(now, deps as never);
    expect(first.enqueued).toBe(1);
    expect(inserted[0].idempotencyKey).toBe("task:TSK-1:due_24h:2026-10-25T08:00:00.000Z:u-graphic:graphic");
    const second = await scheduleTaskReminders(now, deps as never);
    expect(second.enqueued).toBe(0);
  });

  it("sends overdue digests only at 09:00 Tehran", async () => {
    const overdueAt = new Date("2026-10-20T08:00:00.000Z");
    const nineTehran = new Date("2026-10-24T05:30:00.000Z");
    const otherHour = new Date("2026-10-24T02:00:00.000Z");
    const graphic = makeActor();
    const inserted: { idempotencyKey: string }[] = [];
    const base = {
      listReminderCandidates: async () => [
        { taskId: "TSK-9", title: "late", dueAt: overdueAt, status: "open", channel: null, openJobFunctions: ["graphic"] },
      ],
      resolveJobRecipients: async () => [graphic],
      resolveOwners: async () => [],
      insertTaskNotifications: async (rows: { idempotencyKey: string }[]) => {
        let count = 0;
        for (const row of rows) {
          if (!inserted.some((item) => item.idempotencyKey === row.idempotencyKey)) {
            inserted.push(row);
            count += 1;
          }
        }
        return count;
      },
    };
    const atNine = await scheduleTaskReminders(nineTehran, base as never);
    expect(atNine.enqueued).toBe(1);
    expect(inserted[0].idempotencyKey).toContain(":overdue:2026-10-24:");
    const offHour = await scheduleTaskReminders(otherHour, {
      ...base,
      listReminderCandidates: async () => [
        { taskId: "TSK-10", title: "late2", dueAt: overdueAt, status: "open", channel: null, openJobFunctions: ["graphic"] },
      ],
    } as never);
    expect(offHour.enqueued).toBe(0);
  });
});

