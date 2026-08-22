import { enqueueWorkflowNotification, cancelDueNotification, type NotificationEvent, type NotificationPort } from "./notifications";
import { generateEntityId } from "@/lib/ids";

export interface SchedulerPort extends NotificationPort {
  deliverables?: unknown[];
  getDeliverable?: (id: string) => Promise<Record<string, unknown> | null>;
  listOverdueDeliverables?: (now: Date) => Promise<Record<string, unknown>[]>;
}

function tehranDateString(date: Date): string {
  // Asia/Tehran 09:00 daily digest key: use Gregorian date in Tehran
  try {
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export async function scheduleWorkflowReminders(
  port: SchedulerPort & { notifications: import("./notifications").WorkflowNotificationRecord[] },
  now: Date = new Date(),
): Promise<{ enqueued: number }> {
  let enqueued = 0;

  // 1. Assignment/change/failure immediate are handled via explicit enqueue elsewhere; here we focus on due 24h and daily overdue
  // Find deliverables due within 24h and not completed
  const listOverdue = port.listOverdueDeliverables
    ? await port.listOverdueDeliverables(now)
    : [];

  // Also handle provided deliverables array for tests
  const deliverables = (port as unknown as { deliverables?: Record<string, unknown>[] }).deliverables ?? [];

  // Due 24h reminder: for each deliverable with dueAt within next 24h and production not ready/cancelled etc
  const candidates = [...deliverables, ...listOverdue];
  const seen = new Set<string>();
  for (const d of candidates) {
    const id = (d.id as string) ?? (d as unknown as string);
    if (!id || seen.has(id)) continue;
    seen.add(id as string);
    const dueRaw = (d.dueAt as Date | string | null) ?? (d.due_at as Date | string | null) ?? null;
    if (!dueRaw) continue;
    const due = dueRaw instanceof Date ? dueRaw : new Date(dueRaw as string);
    if (Number.isNaN(due.getTime())) continue;
    const diff = due.getTime() - now.getTime();
    // due reminder at 24h before: if due is 24h away (within window) and not already enqueued
    // Check if we should enqueue: diff between 23h and 25h -> approximate 24h
    // For scheduler, we enqueue exactly when now is ~24h before due: we calculate scheduledAt as due -24h, if that time <= now, enqueue
    const scheduledDueReminder = new Date(due.getTime() - 24 * 60 * 60 * 1000);
    if (scheduledDueReminder.getTime() <= now.getTime() && diff > 0) {
      const event: NotificationEvent = {
        type: "due_24h",
        deliverableId: d.id as string,
        assigneeUserId: (d.assigneeUserId as string) ?? (d.assignee_user_id as string) ?? undefined,
        dueAt: due,
        recipientUserId: (d.assigneeUserId as string) ?? (d.assignee_user_id as string) ?? undefined,
        payload: { deliverableName: (d.name as string) ?? id, dueAt: due.toISOString() },
        version: 1,
      };
      const existing = port.notifications.find((n) => n.idempotencyKey === `due24h:${d.id}:${due.toISOString()}`);
      if (!existing) {
        await enqueueWorkflowNotification(port, event);
        enqueued++;
      }
    }
  }

  // 2. Daily overdue digest at 09:00 Asia/Tehran
  // Determine if now is around 09:00 Tehran (within scheduler tick window)
  const tehranHour = Number(
    now.toLocaleString("en-US", { timeZone: "Asia/Tehran", hour: "numeric", hour12: false }),
  );
  const isDigestHour = tehranHour === 9;
  if (isDigestHour) {
    const dateKey = tehranDateString(now);
    // For each overdue deliverable (due < now and not ready/cancelled)
    for (const d of candidates) {
      const id = d.id as string;
      const dueRaw = (d.dueAt as Date | string | null) ?? (d.due_at as Date | string | null) ?? null;
      if (!dueRaw) continue;
      const due = dueRaw instanceof Date ? dueRaw : new Date(dueRaw as string);
      if (due.getTime() >= now.getTime()) continue;
      const prod = (d.productionStatus as string) ?? (d.production_status as string) ?? "";
      if (prod === "ready" || prod === "cancelled") continue;
      const key = `overdue:${id}:${dateKey}`;
      const existing = port.notifications.find((n) => n.idempotencyKey === key);
      if (!existing) {
        const event: NotificationEvent = {
          type: "overdue_daily",
          deliverableId: id,
          assigneeUserId: (d.assigneeUserId as string) ?? (d.assignee_user_id as string) ?? undefined,
          dueAt: dateKey as unknown as Date,
          recipientUserId: (d.assigneeUserId as string) ?? (d.assignee_user_id as string) ?? undefined,
          payload: { deliverableName: (d.name as string) ?? id, dueAt: due.toISOString() },
          version: 1,
        };
        // Override key to stable date
        const rec = await enqueueWorkflowNotification(port, event);
        if (rec) {
          // Fix key to dateKey
          rec.idempotencyKey = key;
        }
        enqueued++;
      }
    }
  }

  return { enqueued };
}

export async function handleDeadlineChange(
  port: SchedulerPort & { notifications: import("./notifications").WorkflowNotificationRecord[] },
  deliverableId: string,
  oldDueAt: string | Date | null,
  newDueAt: string | Date | null,
  assigneeUserId?: string | null,
): Promise<void> {
  if (oldDueAt) {
    await cancelDueNotification(port, deliverableId, oldDueAt);
  }
  if (newDueAt) {
    const due = newDueAt instanceof Date ? newDueAt : new Date(newDueAt as string);
    const event: NotificationEvent = {
      type: "due_24h",
      deliverableId,
      assigneeUserId: assigneeUserId ?? undefined,
      dueAt: due,
      recipientUserId: assigneeUserId ?? undefined,
      payload: { deliverableName: deliverableId, dueAt: due.toISOString() },
    };
    await enqueueWorkflowNotification(port, event);
  }
}

// DB-backed scheduler for cron (real DB)
export async function runSchedulerTick(): Promise<{ enqueued: number }> {
  const { db } = await import("@/db");
  const { workflowDeliverables, workflowNotifications } = await import("@/db/schema");
  const { lt, isNull, ne, and } = await import("drizzle-orm");
  const now = new Date();
  // Due 24h: deliverables due within next 25h and >0
  // Daily overdue: due < now and production not ready/cancelled and run at 09:00 Tehran
  // For simplicity, use JS logic with DB fetch
  const all = await db.select().from(workflowDeliverables).limit(200);
  let enqueued = 0;
  for (const d of all) {
    const raw = d as unknown as Record<string, unknown>;
    const dueRaw = (raw.dueAt as Date | null) ?? (raw.due_at as Date | null) ?? null;
    if (!dueRaw) continue;
    const due = dueRaw instanceof Date ? dueRaw : new Date(dueRaw as string);
    const diff = due.getTime() - now.getTime();
    if (diff > 0 && diff <= 25 * 60 * 60 * 1000) {
      const scheduled = new Date(due.getTime() - 24 * 60 * 60 * 1000);
      if (scheduled.getTime() <= now.getTime()) {
        const key = `due24h:${raw.id}:${due.toISOString()}`;
        const [existing] = await db.select().from(workflowNotifications).where((await import("drizzle-orm")).eq(workflowNotifications.idempotencyKey, key)).limit(1);
        if (!existing) {
          await db.insert(workflowNotifications).values({
            id: generateEntityId("WNT"),
            recipientUserId: (raw.assigneeUserId as string) ?? (raw.assignee_user_id as string) ?? null,
            channel: "in_app",
            eventType: "due_24h",
            payload: { deliverableName: raw.name, dueAt: due.toISOString() },
            idempotencyKey: key,
            scheduledAt: scheduled,
            status: "pending",
            attempts: 0,
            createdAt: now,
            updatedAt: now,
          } as never);
          enqueued++;
        }
      }
    }
  }
  // Overdue daily
  try {
    const tehranHour = Number(now.toLocaleString("en-US", { timeZone: "Asia/Tehran", hour: "numeric", hour12: false }));
    if (tehranHour === 9) {
      const dateKey = tehranDateString(now);
      const overdue = all.filter((r) => {
        const raw = r as unknown as Record<string, unknown>;
        const dueRaw = (raw.dueAt as Date | null) ?? (raw.due_at as Date | null) ?? null;
        if (!dueRaw) return false;
        const due = dueRaw instanceof Date ? dueRaw : new Date(dueRaw as string);
        const prod = (raw.productionStatus as string) ?? (raw.production_status as string) ?? "";
        return due.getTime() < now.getTime() && prod !== "ready" && prod !== "cancelled";
      });
      for (const r of overdue) {
        const raw = r as unknown as Record<string, unknown>;
        const key = `overdue:${raw.id}:${dateKey}`;
        const [existing] = await db.select().from(workflowNotifications).where((await import("drizzle-orm")).eq(workflowNotifications.idempotencyKey, key)).limit(1);
        if (!existing) {
          await db.insert(workflowNotifications).values({
            id: generateEntityId("WNT"),
            recipientUserId: (raw.assigneeUserId as string) ?? (raw.assignee_user_id as string) ?? null,
            channel: "in_app",
            eventType: "overdue_daily",
            payload: { deliverableName: raw.name, dueAt: (raw.dueAt as Date)?.toISOString() ?? "" },
            idempotencyKey: key,
            scheduledAt: now,
            status: "pending",
            attempts: 0,
            createdAt: now,
            updatedAt: now,
          } as never);
          enqueued++;
        }
      }
    }
  } catch {}
  return { enqueued };
}
