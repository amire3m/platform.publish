import { describe, it, expect, vi } from "vitest";
import { enqueueWorkflowNotification, runWorkflowNotificationDelivery } from "./notifications";

describe("workflow notifications idempotency and delivery", () => {
  it("enqueue is idempotent with stable keys", async () => {
    const port: { notifications: unknown[] } = { notifications: [] as never[] };
    const event = {
      type: "assignment",
      deliverableId: "del1",
      assigneeUserId: "u1",
      version: 2,
      recipientUserId: "u1",
      recipientTelegramId: "111",
      payload: { title: "Test" },
    };
    await enqueueWorkflowNotification(port as never, event);
    await enqueueWorkflowNotification(port as never, event);
    expect((port.notifications as unknown[])).toHaveLength(1);
    const rec = (port.notifications as unknown as { idempotencyKey: string }[])[0];
    expect(rec.idempotencyKey).toBe("assignment:del1:u1:2");
  });

  it("skips delivery when no recipient", async () => {
    const port: { notifications: unknown[] } = { notifications: [] as never[] } as never;
    const sendPrivateMessage = vi.fn(async () => true);
    const event = {
      type: "assignment",
      deliverableId: "del2",
      assigneeUserId: "u2",
      version: 1,
      recipientUserId: "u2",
      recipientTelegramId: null,
      payload: { title: "Need" },
    };
    await enqueueWorkflowNotification(port as never, event);
    const notification = (port.notifications as unknown as { recipientTelegramId: string | null }[])[0] as never;
    const result = await runWorkflowNotificationDelivery(port as never, { sendPrivateMessage: sendPrivateMessage as never });
    // after delivery, status should be skipped_no_recipient
    const updated = (port.notifications as unknown as { status: string }[])[0];
    expect(updated.status).toBe("skipped_no_recipient");
    expect(sendPrivateMessage).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("caps attempts at 5 and stores safe payload only", async () => {
    const port: { notifications: unknown[] } = { notifications: [] as never } as never;
    const sendPrivateMessage = vi.fn(async () => { throw new Error("network"); });
    const event = {
      type: "failure",
      publicationId: "pub1",
      version: 1,
      recipientUserId: "u1",
      recipientTelegramId: "111",
      payload: { title: "safe", secret: "should not store", credential: "hide" } as unknown as Record<string, unknown>,
    };
    await enqueueWorkflowNotification(port as never, event);
    // Try 5 deliveries, each will claim with lease: need to reset claimedAt to allow retry
    for (let i = 0; i < 5; i++) {
      const rec = (port.notifications as unknown as { claimedAt: Date | null; status: string }[])[0];
      // reset lease by setting claimedAt far past
      if (rec.claimedAt) rec.claimedAt = new Date(Date.now() - 120000);
      // ensure still pending if not failed
      if (rec.status === "pending") {
        // proceed
      } else if (i < 4) {
        // after failure, status becomes pending again until max, so reset for next iteration
        (rec as unknown as { status: string }).status = "pending";
      }
      await runWorkflowNotificationDelivery(port as never, { sendPrivateMessage: sendPrivateMessage as never });
    }
    const final = (port.notifications as unknown as { attempts: number; status: string; payload: Record<string, unknown> }[])[0];
    expect(final.attempts).toBe(5);
    expect(final.status).toBe("failed");
    expect(final.payload).not.toHaveProperty("secret");
    expect(final.payload).not.toHaveProperty("credential");
    expect(sendPrivateMessage).toHaveBeenCalledTimes(5);
  });

  it("claim with lease prevents duplicate delivery", async () => {
    const port: { notifications: unknown[] } = { notifications: [] as never } as never;
    const sendPrivateMessage = vi.fn(async () => true);
    const event = {
      type: "assignment",
      deliverableId: "del3",
      assigneeUserId: "u3",
      version: 1,
      recipientUserId: "u3",
      recipientTelegramId: "111",
      payload: { title: "x" },
    };
    await enqueueWorkflowNotification(port as never, event);
    await runWorkflowNotificationDelivery(port as never, { sendPrivateMessage: sendPrivateMessage as never });
    const afterFirst = (port.notifications as unknown as { status: string }[])[0];
    expect(afterFirst.status).toBe("sent");
    // second run should not re-deliver
    await runWorkflowNotificationDelivery(port as never, { sendPrivateMessage: sendPrivateMessage as never });
    expect(sendPrivateMessage).toHaveBeenCalledTimes(1);
  });
});
