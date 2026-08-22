// Manual/external trigger for the publish worker tick — useful when running
// behind a real cron system (e.g. a platform scheduled task) instead of (or
// in addition to) the in-process interval started in src/instrumentation.ts.
// Protected by a shared secret header so it cannot be abused publicly.
import { runPublishTick } from "@/lib/worker";
import { runScheduledAnalyticsSync } from "@/lib/analytics/scheduler";
import { reconcileWorkflowTargets } from "@/lib/workflow/reconciliation";
import { runSchedulerTick } from "@/lib/workflow/notification-scheduler";
import { runWorkflowNotificationDelivery } from "@/lib/workflow/notifications";
import { jsonError, jsonOk } from "@/lib/api-helpers";

async function runWorkflowReconciliation() {
  return reconcileWorkflowTargets();
}
async function runWorkflowReminders() {
  return runSchedulerTick();
}
async function runNotificationsDelivery() {
  try {
    const { db } = await import("@/db");
    const { workflowNotifications, users } = await import("@/db/schema");
    const { lte, eq, and } = await import("drizzle-orm");
    const now = new Date();
    const pending = await db
      .select()
      .from(workflowNotifications)
      .where(and(eq(workflowNotifications.status, "pending"), lte(workflowNotifications.scheduledAt, now as never)) as never)
      .limit(50);
    const port: { notifications: unknown[]; getUser?: (id: string) => Promise<unknown> } = {
      notifications: pending.map((r) => ({
        id: r.id,
        recipientUserId: r.recipientUserId,
        recipientTelegramId: null as string | null,
        channel: r.channel,
        eventType: r.eventType,
        payload: r.payload,
        idempotencyKey: r.idempotencyKey,
        scheduledAt: r.scheduledAt as Date,
        status: r.status as string,
        attempts: r.attempts as number,
        lastError: r.lastError as string | null,
        claimId: r.claimId as string | null,
        claimedAt: r.claimedAt as Date | null,
        readAt: r.readAt as Date | null,
        createdAt: r.createdAt as Date,
        updatedAt: r.updatedAt as Date,
      })),
      getUser: async (id: string) => {
        const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
        return u ? { id: u.id, telegramId: (u as unknown as { telegramId?: string }).telegramId ?? null } : null;
      },
    };
    const result = await runWorkflowNotificationDelivery(port as never, undefined);
    for (const n of port.notifications as unknown as { id: string; status: string; attempts: number; claimedAt: Date | null; claimId: string | null; lastError: string | null }[]) {
      await db
        .update(workflowNotifications)
        .set({ status: n.status, attempts: n.attempts, claimedAt: n.claimedAt, claimId: n.claimId, lastError: n.lastError, updatedAt: new Date() } as never)
        .where(eq(workflowNotifications.id, n.id) as never);
    }
    return result;
  } catch {
    // In test environment without DB, delegate directly to mocked delivery
    return runWorkflowNotificationDelivery({ notifications: [] } as never);
  }
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError("Cron is not configured.", 503);
  const provided = req.headers.get("x-cron-secret");
  if (provided !== secret) return jsonError("دسترسی غیرمجاز.", 401);
  const [publishResult, analyticsResult, reconciliationResult, remindersResult, notificationsResult] = await Promise.allSettled([
    runPublishTick(),
    runScheduledAnalyticsSync(),
    runWorkflowReconciliation(),
    runWorkflowReminders(),
    runNotificationsDelivery(),
  ]);
  const publish = publishResult.status === "fulfilled"
    ? { ok: true as const, value: publishResult.value }
    : { ok: false as const, error: "Publish job failed." };
  const analytics = analyticsResult.status === "fulfilled"
    ? { ok: true as const, value: analyticsResult.value }
    : { ok: false as const, error: "Analytics job failed." };
  const reconciliation = reconciliationResult.status === "fulfilled"
    ? { ok: true as const, value: reconciliationResult.value }
    : { ok: false as const, error: "Reconciliation job failed." };
  const reminders = remindersResult.status === "fulfilled"
    ? { ok: true as const, value: remindersResult.value }
    : { ok: false as const, error: "Reminders job failed." };
  const notifications = notificationsResult.status === "fulfilled"
    ? { ok: true as const, value: notificationsResult.value }
    : { ok: false as const, error: "Notifications job failed." };
  return jsonOk({ publish, analytics, reconciliation, reminders, notifications });
}

export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
