// Next.js instrumentation hook — runs once when the server process starts.
// We use it to start the in-process publish worker interval (see
// src/lib/worker.ts for the architectural note on why this is in-process
// rather than a separate container in this deployment).
let instrumentationRunning = false;

// Throttles for the heavier background jobs so the 60s publish loop is
// never starved: mirrors every 5 min, retention sweep every 30 min, insta keep-alive every 6h.
let lastMirrorRun = 0;
let lastSweepRun = 0;
let lastInstaKeepAlive = 0;

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
      (async () => {
        // vids.st mirrors: resume uploading + process queued (bounded budget per run).
        try {
          if (Date.now() - lastMirrorRun < 5 * 60 * 1000) return null;
          lastMirrorRun = Date.now();
          const { reconcileMirrors } = await import("@/lib/mirrors/reconcile");
          const out = await reconcileMirrors({ maxItems: 3, poll: { tries: 2, intervalMs: 15000 } });
          if (out.checked || out.enqueued || out.failed || out.requeued) {
            console.log("[mirrors] tick:", JSON.stringify(out));
          }
          return out;
        } catch (err) {
          console.error("[mirrors] reconcile tick failed:", (err as Error).message);
          return { checked: 0, completed: 0, failed: 0, enqueued: 0, requeued: 0 };
        }
      })(),
      (async () => {
        // Media retention sweep (dry-run unless MEDIA_SWEEP_DRY_RUN=0).
        try {
          if (Date.now() - lastSweepRun < 30 * 60 * 1000) return null;
          lastSweepRun = Date.now();
          const { runMediaSweep } = await import("@/lib/media/retention");
          const out = await runMediaSweep();
          console.log(`[media] sweep: disk=${out.diskPct}% ttl=${out.ttlDays}d deleted=${out.deleted} freed=${Math.round(out.freedBytes / 1048576)}MB errors=${out.errors}`);
          return out;
        } catch (err) {
          console.error("[media] sweep tick failed:", (err as Error).message);
          return { scanned: 0, deleted: 0, freedBytes: 0, errors: 0 };
        }
      })(),
      (async () => {
        // Instagram browser session keep-alive: touch each session every 6h
        // to rotate cookies and prevent idle expiry. Best-effort, never throws.
        try {
          if (Date.now() - lastInstaKeepAlive < 6 * 60 * 60 * 1000) return null;
          lastInstaKeepAlive = Date.now();
          const { db } = await import("@/db");
          const { socialAccounts } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");
          const { getBrowserSessionHealth, touchBrowserSession } = await import("@/lib/instagram/session");
          const rows = await db.select().from(socialAccounts).where(eq(socialAccounts.platform, "instagram"));
          for (const acc of rows as unknown as Array<{ id: string; capabilities: Record<string, unknown> }>) {
            if (!(acc.capabilities as Record<string, unknown>)?.browserSession) continue;
            const health = await getBrowserSessionHealth(acc.id);
            if (!health.exists) continue;
            if (!health.needsRefresh) continue;
            const res = await touchBrowserSession(acc.id);
            console.log(`[instagram] keep-alive ${acc.id}: ${res.ok ? "refreshed" : "failed"} — ${res.detail}`);
            if (!res.ok) {
              // Notify via capabilities flag so UI shows warning
              try {
                await db.update(socialAccounts).set({ capabilities: { ...acc.capabilities, browserSessionHealthy: false } } as never).where(eq(socialAccounts.id, acc.id));
              } catch {}
            }
          }
          return { ok: true };
        } catch (err) {
          console.error("[instagram] keep-alive tick failed:", (err as Error).message);
          return { ok: false };
        }
      })(),
      (async () => {
        // Radar weekly run: Sunday 06:00 Asia/Tehran
        try {
          const now = new Date();
          const tehran = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", weekday: "short", hour: "2-digit" }).format(now);
          const isSunday = tehran.startsWith("Sun");
          const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", hour12: false }).format(now));
          if (!isSunday || hour !== 6) return null;
          // Run once per week: check if a run already exists for this week
          const { db } = await import("@/db");
          const { radarRuns } = await import("@/db/schema");
          const { desc } = await import("drizzle-orm");
          const [last] = (await db.select().from(radarRuns).orderBy(desc(radarRuns.createdAt)).limit(1)) as unknown as Array<{ weekStart: Date }>;
          if (last) {
            const diff = now.getTime() - new Date(last.weekStart).getTime();
            if (diff < 6 * 86400000) return null;
          }
          const { runRadarOnce } = await import("@/lib/radar/run");
          const out = await runRadarOnce();
          console.log(`[radar] weekly run: ${out.items} items, run ${out.runId}`);
          return out;
        } catch (err) {
          console.error("[radar] weekly tick failed:", (err as Error).message);
          return { runId: "", items: 0 };
        }
      })(),
      (async () => {
        // Operator autonomous run: daily 06:00 Asia/Tehran if strategy is active and buffer low
        try {
          const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", hour12: false }).format(new Date()));
          if (hour !== 6) return null;
          const { getStrategy } = await import("@/lib/operator");
          const s = await getStrategy();
          if (!s || s.status !== "active") return null;
          const { db } = await import("@/db");
          const { content } = await import("@/db/schema");
          const { sql } = await import("drizzle-orm");
          const [cnt] = (await db.select({ c: sql`count(*)` }).from(content).where(sql`${content.status} IN ('draft','in_review')`)) as unknown as Array<{ c: number }>;
          if (Number(cnt?.c ?? 0) >= 4) return null;
          const { runOperatorNow } = await import("@/lib/operator");
          const out = await runOperatorNow();
          console.log(`[operator] autonomous run: ${out.plan.length} items, run ${out.runId}`);
          return out;
        } catch (err) {
          console.error("[operator] tick failed:", (err as Error).message);
          return null;
        }
      })(),
    ]).finally(() => {
      instrumentationRunning = false;
    });
  }, intervalMs);

  console.log(`[worker] YouTube EmRo publish worker started (interval: ${intervalMs}ms)`);
}
