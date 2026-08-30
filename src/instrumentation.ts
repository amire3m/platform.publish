// Next.js instrumentation hook — runs once when the server process starts.
// We use it to start the in-process publish worker interval (see
// src/lib/worker.ts for the architectural note on why this is in-process
// rather than a separate container in this deployment).
let instrumentationRunning = false;

async function safeRun(name: string, fn: () => Promise<unknown>) {
  if (instrumentationRunning) return;
  try {
    await fn();
  } catch (err) {
    console.error(`[instrumentation] ${name} failed:`, (err as Error).message);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_PUBLISH_WORKER === "1") return;

  // Smart analytics auto-sync: daily 03:00 Asia/Tehran for all 4 Emro YT channels
  try {
    const { scheduleDailySync } = await import("@/lib/analytics/sync-controller");
    scheduleDailySync();
    console.log("[analytics] daily auto-sync scheduled for 03:00 Asia/Tehran");
  } catch (err) {
    console.error("[analytics] failed to schedule daily sync:", (err as Error).message);
  }

  // Live conductor: mark DB sessions from a previous process as interrupted.
  try {
    const { reconcileInterruptedSessions } = await import("@/lib/live/conductor");
    await reconcileInterruptedSessions();
    console.log("[live] interrupted session reconciliation done");
  } catch (err) {
    console.error("[live] interrupted reconciliation failed:", (err as Error).message);
  }

  const { runPublishTick } = await import("@/lib/worker");
  const intervalMs = Number(process.env.WORKER_TICK_INTERVAL_MS || 60_000);

  setInterval(() => {
    if (instrumentationRunning) return;
    instrumentationRunning = true;
    Promise.allSettled([
      runPublishTick(),
      (async () => {
        const { runLiveConductorTickReal } = await import("@/lib/live/conductor");
        return runLiveConductorTickReal();
      })(),
      (async () => {
        const { reconcileWorkflowTargets } = await import("@/lib/workflow/reconciliation");
        return reconcileWorkflowTargets();
      })(),
      (async () => {
        const { runSchedulerTick } = await import("@/lib/workflow/notification-scheduler");
        return runSchedulerTick();
      })(),
      (async () => {
        const { runWorkflowNotificationDelivery } = await import("@/lib/workflow/notifications");
        // DB-backed delivery via same logic as cron route but without CRON_SECRET
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
            recipientTelegramId: null,
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
        const result = await runWorkflowNotificationDelivery(port as never);
        for (const n of port.notifications as unknown as { id: string; status: string; attempts: number; claimedAt: Date | null; claimId: string | null; lastError: string | null }[]) {
          await db
            .update(workflowNotifications)
            .set({ status: n.status, attempts: n.attempts, claimedAt: n.claimedAt, claimId: n.claimId, lastError: n.lastError, updatedAt: new Date() } as never)
            .where(eq(workflowNotifications.id, n.id) as never);
        }
        return result;
      })(),
      (async () => {
        try {
          const { runAnalyticsAutoSyncTick } = await import("@/lib/analytics/sync-controller");
          return runAnalyticsAutoSyncTick();
        } catch (err) {
          console.error("[analytics] auto-sync tick failed:", (err as Error).message);
          return { enqueued: [] as string[] };
        }
      })(),
    ]).finally(() => {
      instrumentationRunning = false;
    });
  }, intervalMs);

  console.log(`[worker] YouTube EmRo publish worker started (interval: ${intervalMs}ms)`);
}
