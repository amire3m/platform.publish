import { and, eq, lte, or, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { workflowPublications, workflowDeliverables, workflowPrograms, socialAccounts, credentials } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { getTelegramConfig, TelegramClient } from "@/lib/telegram/client";
import { youtubeProvider } from "@/lib/providers/youtube";
import { runBigJob } from "@/lib/media/big-job";
import { cleanupPayload, payloadSize, type MediaPayload } from "@/lib/media/payload";
import { checkPublishGate, jitterDelayMs, normalizeScheduleSettings, tehranDayKey } from "@/lib/publish/schedule";

let tickRunning = false;

async function getMediaPayload(client: TelegramClient, fileId: string): Promise<MediaPayload> {
  return runBigJob(`wf-publish:${fileId.slice(0, 16)}`, async () => {
    const info = await client.getFile(fileId);
    const size = Number((info as unknown as { file_size?: number }).file_size ?? 0);
    if (size > TelegramClient.BUFFER_LIMIT_BYTES) {
      const dl = await client.downloadToTempFile(fileId);
      return { kind: "file", path: dl.path, size: dl.size, cleanup: dl.cleanup } as MediaPayload;
    }
    return { kind: "buffer", buffer: await client.downloadFile(fileId) } as MediaPayload;
  });
}

export async function runWorkflowPublishTick(): Promise<{ processed: number; errors: number }> {
  if (tickRunning) return { processed: 0, errors: 0 };
  tickRunning = true;
  try {
    return await doTick();
  } finally {
    tickRunning = false;
  }
}

async function doTick(): Promise<{ processed: number; errors: number }> {
  const now = new Date();
  // Find due workflow publications: ready/scheduled/failed with production ready and scheduledAt <= now
  const duePubs = await db
    .select()
    .from(workflowPublications)
    .where(
      and(
        or(eq(workflowPublications.status, "ready"), eq(workflowPublications.status, "scheduled"), eq(workflowPublications.status, "failed")),
        or(isNull(workflowPublications.scheduledAt), lte(workflowPublications.scheduledAt, now)),
      ),
    )
    .limit(5);

  let processed = 0;
  let errors = 0;

  for (const pub of duePubs) {
    // Load deliverable + program for fileRef and title
    const [del] = await db.select().from(workflowDeliverables).where(eq(workflowDeliverables.id, pub.deliverableId)).limit(1);
    if (!del) continue;
    if ((del as unknown as { productionStatus: string }).productionStatus !== "ready") continue;
    const fileRef = (del as unknown as { fileRef: string | null }).fileRef;
    if (!fileRef || fileRef.startsWith("tg_msg_") || fileRef.startsWith("sample_")) continue;

    const [prog] = await db.select().from(workflowPrograms).where(eq(workflowPrograms.id, (del as unknown as { programId: string }).programId)).limit(1);
    const title = (del as unknown as { name: string }).name ?? prog?.title ?? "بدون عنوان";
    const notes = (del as unknown as { notes: string | null }).notes ?? null;

    // Resolve account
    if (!pub.socialAccountId) {
      // No account -> cannot publish, mark failed with message
      continue;
    }
    const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, pub.socialAccountId)).limit(1);
    if (!account) continue;
    if (account.connectionStatus !== "connected") continue;

    // Schedule gate (cap/cooldown/window) - same as content worker
    try {
      const settings = normalizeScheduleSettings(account as unknown as Record<string, unknown>);
      // jitter for first sight without scheduledAt
      if (!pub.scheduledAt && settings.jitterMin > 0) {
        // Check if already delayed: look at updatedAt recency
        const age = now.getTime() - new Date(pub.updatedAt).getTime();
        if (age < 60_000) {
          // First tick after creation, delay via jitter
          const delayed = new Date(now.getTime() + jitterDelayMs(settings.jitterMin));
          await db.update(workflowPublications).set({ scheduledAt: delayed, updatedAt: now } as never).where(eq(workflowPublications.id, pub.id));
          continue;
        }
      }
      const gate = checkPublishGate(now, settings, {
        lastPublishedAt: (account.lastPublishedAt ?? null) as Date | string | null,
        day: (account.publishedDay ?? null) as string | null,
        count: Number(account.publishedTodayCount ?? 0),
      });
      if (!gate.ok) {
        if (gate.reason === "window") continue;
        const retryAt = new Date(now.getTime() + gate.retryAfterMs);
        await db.update(workflowPublications).set({ scheduledAt: retryAt, updatedAt: now } as never).where(eq(workflowPublications.id, pub.id));
        continue;
      }
    } catch (e) {
      console.error("[wf-worker] gate check failed", pub.id, (e as Error).message);
    }

    // Claim: ready/scheduled -> publishing via worker actor
    try {
      const { createWorkflowRepository } = await import("@/lib/workflow/repository");
      const repo = createWorkflowRepository();
      await repo.transitionPublication({
        id: pub.id,
        expectedVersion: pub.version,
        action: "claim_publish" as never,
        actor: "worker",
        actorUserId: "worker",
      });
    } catch (e) {
      // Already claimed or invalid transition, skip
      continue;
    }

    // Now publish
    let cfg: ReturnType<typeof getTelegramConfig> = null;
    try { cfg = getTelegramConfig(); } catch { cfg = null; }
    if (!cfg) {
      await failPub(pub.id, "اتصال تلگرام برقرار نیست.");
      errors++;
      continue;
    }
    const client = new TelegramClient(cfg);

    // Credential for youtube
    let credentialPayload: Record<string, unknown> | null = null;
    if (account.credentialRef) {
      const [cred] = await db.select().from(credentials).where(eq(credentials.id, account.credentialRef)).limit(1);
      if (cred) {
        try { credentialPayload = JSON.parse(decryptSecret(cred.encryptedPayload)); } catch {}
      }
    }

    let payload: MediaPayload | null = null;
    try {
      payload = await getMediaPayload(client, fileRef);
      const fileBuffer = payload.kind === "buffer" ? payload.buffer : Buffer.alloc(0);
      const filePath = payload.kind === "file" ? payload.path : null;
      const fileSize = payloadSize(payload);

      let result: { ok: boolean; externalId?: string | null; permalink?: string | null; message?: string; retryable?: boolean };

      if (pub.platform === "youtube") {
        const r = await youtubeProvider.publish({
          accountExternalId: account.externalAccountId ?? "",
          credentialPayload,
          fileBuffer,
          filePath,
          fileSize,
          fileName: `${title}.mp4`,
          mimeType: "video/mp4",
          contentType: (del as unknown as { kind: string }).kind === "reel" ? "reel" : "full_video",
          title: title.slice(0, 100),
          description: notes ?? "",
          tags: [],
          privacyStatus: "private",
          madeForKids: false,
          publishAtUtc: null,
        });
        result = { ok: r.ok, externalId: (r as unknown as { externalId?: string }).externalId ?? null, permalink: (r as unknown as { permalink?: string }).permalink ?? null, message: (r as unknown as { message?: string }).message, retryable: (r as unknown as { retryable?: boolean }).retryable };
      } else if (pub.platform === "instagram") {
        // Instagram reel via browser or business suite
        const caps = (account.capabilities ?? {}) as Record<string, unknown>;
        const isReel = true;
        if (caps.businessSuite === true || caps.browserSession === true) {
          let browserPath = filePath;
          let browserCleanup: (() => Promise<void>) | null = null;
          if (!browserPath) {
            const dl = await client.downloadToTempFile(fileRef);
            browserPath = dl.path;
            browserCleanup = dl.cleanup;
          }
          // Ensure session path for business suite
          if (caps.businessSuite === true) {
            try {
              const { suiteSessionPath } = await import("@/lib/business/suite-session");
              const { sessionPath } = await import("@/lib/instagram/session");
              const src = suiteSessionPath(account.id);
              const dst = sessionPath(account.id);
              const { copyFile, mkdir } = await import("node:fs/promises");
              const { dirname } = await import("node:path");
              await mkdir(dirname(dst), { recursive: true });
              await copyFile(src, dst).catch(() => {});
            } catch {}
          }
          const { instagramBrowserPublish } = await import("@/lib/providers/instagram-browser");
          const hasSession = caps.businessSuite ? true : true; // will fail inside if missing
          const r = await instagramBrowserPublish(
            {
              accountExternalId: account.externalAccountId ?? "",
              credentialPayload: null,
              fileBuffer: Buffer.alloc(0),
              filePath: browserPath,
              fileSize,
              fileName: `${title}.mp4`,
              mimeType: "video/mp4",
              contentType: "reel",
              caption: notes ?? title,
              hashtags: [],
            },
            account.id,
          );
          if (browserCleanup) await browserCleanup().catch(() => {});
          result = { ok: r.ok, externalId: (r as unknown as { externalId?: string }).externalId ?? null, permalink: (r as unknown as { permalink?: string }).permalink ?? null, message: (r as unknown as { message?: string }).message, retryable: (r as unknown as { retryable?: boolean }).retryable };
        } else {
          result = { ok: false, message: "حساب اینستاگرام متصل نیست یا سشن مرورگر ندارد.", retryable: false };
        }
      } else {
        result = { ok: false, message: "پلتفرم پشتیبانی نمی‌شود.", retryable: false };
      }

      if (result.ok) {
        const repo2 = (await import("@/lib/workflow/repository")).createWorkflowRepository();
        const [fresh] = await db.select().from(workflowPublications).where(eq(workflowPublications.id, pub.id)).limit(1);
        await repo2.transitionPublication({
          id: pub.id,
          expectedVersion: fresh.version,
          action: "publish_succeeded" as never,
          actor: "worker",
          actorUserId: "worker",
        });
        // Save permalink/externalId
        await db.update(workflowPublications).set({ externalId: result.externalId ?? null, permalink: result.permalink ?? null, lastErrorMessage: null, lastErrorCode: null } as never).where(eq(workflowPublications.id, pub.id));
        // Bookkeeping
        try {
          const today = tehranDayKey(now);
          const prevDay = (account.publishedDay ?? null) as string | null;
          const prevCount = Number(account.publishedTodayCount ?? 0);
          const count = prevDay === today ? prevCount + 1 : 1;
          await db.update(socialAccounts).set({ lastPublishedAt: now, publishedDay: today, publishedTodayCount: count } as never).where(eq(socialAccounts.id, account.id));
        } catch {}
        processed++;
      } else {
        await failPub(pub.id, result.message ?? "انتشار ناموفق بود.", result.retryable);
        errors++;
      }
    } catch (err) {
      console.error("[wf-worker] publish threw", pub.id, (err as Error).message);
      await failPub(pub.id, "انتشار با خطا مواجه شد. دوباره تلاش کنید.");
      errors++;
    } finally {
      if (payload) await cleanupPayload(payload);
    }
  }

  return { processed, errors };
}

async function failPub(pubId: string, message: string, retryable?: boolean) {
  try {
    const [fresh] = await db.select().from(workflowPublications).where(eq(workflowPublications.id, pubId)).limit(1);
    if (!fresh) return;
    const repo = (await import("@/lib/workflow/repository")).createWorkflowRepository();
    // If currently publishing, move to failed, else keep ready for retry
    if (fresh.status === "publishing") {
      await repo.transitionPublication({
        id: pubId,
        expectedVersion: fresh.version,
        action: "publish_failed" as never,
        actor: "worker",
        actorUserId: "worker",
      });
      const [after] = await db.select().from(workflowPublications).where(eq(workflowPublications.id, pubId)).limit(1);
      await db.update(workflowPublications).set({ lastErrorMessage: message, lastErrorCode: retryable ? "RETRYABLE" : "FAILED" } as never).where(eq(workflowPublications.id, after.id));
    } else {
      await db.update(workflowPublications).set({ lastErrorMessage: message, lastErrorCode: "FAILED" } as never).where(eq(workflowPublications.id, pubId));
    }
  } catch (e) {
    console.error("[wf-worker] failPub failed", pubId, (e as Error).message);
  }
}
