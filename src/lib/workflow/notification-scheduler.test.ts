import { describe, it, expect, vi } from "vitest";
import { scheduleWorkflowReminders, handleDeadlineChange } from "./notification-scheduler";

describe("notification-scheduler", () => {
  it("generates due 24h reminder and daily overdue at 09:00 Tehran (immediate simulation)", async () => {
    // Due reminder: due in 24h -> scheduler should enqueue due24h
    const now = new Date("2026-08-22T07:00:00.000Z"); // 07 UTC
    const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const port: { notifications: unknown[]; deliverables: unknown[] } = {
      notifications: [] as never[],
      deliverables: [{ id: "del1", dueAt, assigneeUserId: "u1", productionStatus: "in_progress", name: "Reel 1" }],
    };
    await scheduleWorkflowReminders(port as never, now);
    const hasDue = (port.notifications as unknown as { idempotencyKey: string }[]).some((n) => n.idempotencyKey.startsWith("due24h:del1"));
    expect(hasDue).toBe(true);
  });

  it("deadline change cancels old due key and adds new one", async () => {
    const port: { notifications: unknown[] } = { notifications: [] as never[] } as never;
    const oldDue = new Date("2026-08-23T10:00:00.000Z");
    const newDue = new Date("2026-08-24T10:00:00.000Z");
    // enqueue old
    const { enqueueWorkflowNotification } = await import("./notifications");
    await enqueueWorkflowNotification(port as never, { type: "due_24h", deliverableId: "del1", dueAt: oldDue, recipientUserId: "u1", version: 1 } as never);
    expect((port.notifications as unknown as { status: string }[])[0].status).toBe("pending");
    await handleDeadlineChange(port as never, "del1", oldDue, newDue, "u1");
    const oldRec = (port.notifications as unknown as { idempotencyKey: string; status: string }[]).find((n) => n.idempotencyKey === `due24h:del1:${oldDue.toISOString()}`);
    expect(oldRec?.status).toBe("cancelled");
    const newRec = (port.notifications as unknown as { idempotencyKey: string }[]).find((n) => n.idempotencyKey === `due24h:del1:${newDue.toISOString()}`);
    expect(newRec).toBeDefined();
  });

  it("overdue daily digest only at 09:00 Asia/Tehran", async () => {
    // Simulate 09:00 Tehran = 05:30 UTC (Tehran is UTC+3:30)
    const tehranNine = new Date("2026-08-22T05:30:00.000Z");
    const port: { notifications: unknown[]; deliverables: unknown[] } = {
      notifications: [] as never[],
      deliverables: [{ id: "delOver", dueAt: new Date(tehranNine.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), assigneeUserId: "u1", productionStatus: "in_progress", name: "Overdue" }],
    };
    await scheduleWorkflowReminders(port as never, tehranNine);
    const hasOverdue = (port.notifications as unknown as { eventType: string }[]).some((n) => n.eventType === "overdue_daily");
    expect(hasOverdue).toBe(true);

    const notNine = new Date("2026-08-22T02:00:00.000Z");
    const port2: { notifications: unknown[]; deliverables: unknown[] } = {
      notifications: [] as never[],
      deliverables: [{ id: "delOver2", dueAt: new Date(notNine.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), assigneeUserId: "u1", productionStatus: "in_progress", name: "Overdue2" }],
    };
    await scheduleWorkflowReminders(port2 as never, notNine);
    const hasOverdue2 = (port2.notifications as unknown as { eventType: string }[]).some((n) => n.eventType === "overdue_daily");
    // Should be false when not 09:00 Tehran
    expect(hasOverdue2).toBe(false);
  });
});
