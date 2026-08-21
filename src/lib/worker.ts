// -----------------------------------------------------------------------------
// Publish worker.
// -----------------------------------------------------------------------------
// Runs on a 60s interval (see src/instrumentation.ts) inside the same Next.js
// server process. This is a pragmatic adaptation of the "separate Worker
// process + BullMQ/Redis" architecture described in the product spec to a
// single-deployment Next.js target: the queue is simply the `content` table
// (status + scheduledAtUtc), leasing is done with `lockedBy`/`lockedAt`
// columns, and retries use exponential backoff stored per platform target.
// For larger deployments this function can be extracted verbatim into a
// standalone Node process (or BullMQ worker) — it has no dependency on the
// HTTP request/response cycle. It can also be triggered manually/externally
// via `POST /api/cron/tick` (e.g. from a real cron or container sidecar).
// -----------------------------------------------------------------------------
import { and, lte, or, isNull, eq } from "drizzle-orm";
import { db } from "@/db";
import { content, socialAccounts, credentials, telegramTopics } from "@/db/schema";
import { TelegramClient, getTelegramConfig } from "./telegram/client";
import { updateContentRecord, appendAuditEvent, notifyUser, buildTgdbMessage } from "./telegram/tgdb";
import { decryptSecret, encryptSecret } from "./crypto";
import { youtubeProvider } from "./providers/youtube";
import { instagramProvider, refreshInstagramToken } from "./providers/instagram";
import { mockPublish } from "./providers/mock";
import { formatJalaliDateTime, nowUtcIso } from "./date/jalali";
import jwt from "jsonwebtoken";

const LEASE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY = 5;
const BASE_BACKOFF_MS = 2 * 60 * 1000; // 2 minutes

interface PlatformTarget {
  [key: string]: unknown;
  platform: "youtube" | "instagram";
  account_id: string;
  content_type: string;
  status: string;
  publish_at_utc?: string | null;
  publish_at_jalali?: string | null;
  fields?: Record<string, unknown>;
  attempts?: number;
  nextRetryAt?: string | null;
  externalId?: string;
  permalink?: string;
  lastError?: string | null;
}

let tickRunning = false;

export async function runPublishTick(): Promise<{ processed: number; errors: number }> {
  if (tickRunning) return { processed: 0, errors: 0 };
  tickRunning = true;
  try {
    return await doTick();
  } finally {
    tickRunning = false;
  }
}

/** Immediately lease + process a single content record (used by "انتشار فوری"). */
export async function publishContentNow(id: string) {
  const now = new Date();
  const leaseThreshold = new Date(now.getTime() - LEASE_MS);
  const leased = await db
    .update(content)
    .set({ lockedBy: "manual-publish", lockedAt: now, status: "publishing" })
    .where(
      and(
        eq(content.id, id),
        or(isNull(content.lockedAt), lte(content.lockedAt, leaseThreshold)),
      ),
    )
    .returning();
  if (leased.length === 0) {
    throw new Error("محتوا در حال حاضر توسط Worker دیگری در حال پردازش است.");
  }
  await processContent(leased[0], { force: true });
  const [fresh] = await db.select().from(content).where(eq(content.id, id)).limit(1);
  return fresh;
}

async function doTick() {
  const now = new Date();
  const leaseThreshold = new Date(now.getTime() - LEASE_MS);

  // Opportunistic token refresh (best-effort, never fails the tick).
  try {
    await refreshExpiringInstagramTokens();
  } catch (err) {
    console.error("[worker] instagram token refresh scan failed:", (err as Error).message);
  }

  const due = await db
    .select()
    .from(content)
    .where(
      and(
        or(eq(content.status, "scheduled"), eq(content.status, "publishing")),
        lte(content.scheduledAtUtc, now),
        or(isNull(content.lockedAt), lte(content.lockedAt, leaseThreshold)),
      ),
    )
    .limit(20);

  let processed = 0;
  let errors = 0;

  for (const row of due) {
    const leased = await db
      .update(content)
      .set({ lockedBy: "publish-worker", lockedAt: now, status: "publishing" })
      .where(
        and(
          eq(content.id, row.id),
          or(isNull(content.lockedAt), lte(content.lockedAt, leaseThreshold)),
        ),
      )
      .returning();
    if (leased.length === 0) continue; // another worker instance already grabbed it

    try {
      await processContent(leased[0]);
      processed++;
    } catch (err) {
      errors++;
      console.error("[worker] failed processing content", row.id, (err as Error).message);
    }
  }

  return { processed, errors };
}

async function getMediaBytes(client: TelegramClient, fileId: string): Promise<Buffer> {
  return client.downloadFile(fileId);
}

function buildMediaProxyUrl(fileId: string): string {
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  const token = jwt.sign({ fileId }, secret, { expiresIn: "15m" });
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  return `${base}/api/media/telegram/${token}`;
}

async function processContent(row: typeof content.$inferSelect, opts?: { force?: boolean }) {
  const targets = (row.platformTargets as unknown as PlatformTarget[]) ?? [];
  const media = (row.media as { telegram_file_id?: string; mime_type?: string; file_name?: string }[]) ?? [];
  const primaryMedia = media[0];

  let cfg: ReturnType<typeof getTelegramConfig> = null;
  try {
    cfg = getTelegramConfig();
  } catch {
    cfg = null;
  }
  const client = cfg ? new TelegramClient(cfg) : null;

  const updatedTargets: PlatformTarget[] = [];
  const publishResults: Record<string, unknown>[] = Array.isArray(row.publishResults) ? [...row.publishResults] : [];
  let anySuccess = false;
  let anyFailure = false;

  for (const target of targets) {
    if (target.status === "published") {
      updatedTargets.push(target); // idempotent: never republish a success
      continue;
    }
    const due = opts?.force || !target.publish_at_utc || new Date(target.publish_at_utc) <= new Date();
    const backoffOk = opts?.force || !target.nextRetryAt || new Date(target.nextRetryAt) <= new Date();
    if (!due || !backoffOk || target.status === "cancelled") {
      updatedTargets.push(target);
      continue;
    }

    const attempts = (target.attempts ?? 0) + 1;
    if (attempts > MAX_RETRY) {
      updatedTargets.push({ ...target, status: "failed", lastError: "حداکثر تعداد تلاش مجدد انجام شد." });
      anyFailure = true;
      continue;
    }

    const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, target.account_id)).limit(1);
    if (!account) {
      updatedTargets.push({ ...target, status: "failed", attempts, lastError: "حساب مقصد یافت نشد." });
      anyFailure = true;
      continue;
    }

    let credentialPayload: Record<string, unknown> | null = null;
    if (account.credentialRef) {
      const [cred] = await db.select().from(credentials).where(eq(credentials.id, account.credentialRef)).limit(1);
      if (cred) {
        try {
          credentialPayload = JSON.parse(decryptSecret(cred.encryptedPayload));
        } catch {
          credentialPayload = null;
        }
      }
    }

    if (!primaryMedia?.telegram_file_id || !client) {
      updatedTargets.push({
        ...target,
        status: "failed",
        attempts,
        lastError: "فایل اصلی در تلگرام یافت نشد یا اتصال تلگرام برقرار نیست.",
      });
      anyFailure = true;
      continue;
    }

    try {
      const fileBuffer = await getMediaBytes(client, primaryMedia.telegram_file_id);
      const isMock = account.connectionStatus !== "connected";

      const result = isMock
        ? await mockPublish(target.platform, {
            accountExternalId: account.externalAccountId ?? "",
            credentialPayload,
            fileBuffer,
            fileName: primaryMedia.file_name ?? "media",
            mimeType: primaryMedia.mime_type ?? "application/octet-stream",
            contentType: target.content_type,
            title: row.title,
            description: row.description,
            caption: row.caption,
            hashtags: row.hashtags as string[],
            privacyStatus: (target.fields?.privacyStatus as string) ?? "private",
            publishAtUtc: target.publish_at_utc ?? null,
          })
        : target.platform === "youtube"
          ? await youtubeProvider.publish({
              accountExternalId: account.externalAccountId ?? "",
              credentialPayload,
              fileBuffer,
              fileName: primaryMedia.file_name ?? "media.mp4",
              mimeType: primaryMedia.mime_type ?? "video/mp4",
              contentType: target.content_type,
              title: row.title,
              description: row.description,
              tags: row.tags as string[],
              privacyStatus: (target.fields?.privacyStatus as string) ?? "private",
              madeForKids: Boolean(target.fields?.madeForKids),
              publishAtUtc: target.publish_at_utc ?? null,
            })
          : await instagramProvider.publishWithUrl(
              {
                accountExternalId: account.externalAccountId ?? "",
                credentialPayload,
                fileBuffer,
                fileName: primaryMedia.file_name ?? "media",
                mimeType: primaryMedia.mime_type ?? "image/jpeg",
                contentType: target.content_type,
                caption: row.caption,
                hashtags: row.hashtags as string[],
              },
              buildMediaProxyUrl(primaryMedia.telegram_file_id),
            );

      publishResults.push({
        platform: target.platform,
        accountId: target.account_id,
        attempt: attempts,
        at: nowUtcIso(),
        ...result,
      });

      if (result.ok) {
        updatedTargets.push({
          ...target,
          status: "published",
          attempts,
          externalId: result.externalId,
          permalink: result.permalink,
          lastError: null,
        });
        anySuccess = true;
      } else {
        const nextRetryAt = result.retryable
          ? new Date(Date.now() + BASE_BACKOFF_MS * Math.pow(2, attempts - 1)).toISOString()
          : null;
        updatedTargets.push({
          ...target,
          status: result.retryable && attempts < MAX_RETRY ? "scheduled" : "failed",
          attempts,
          nextRetryAt,
          lastError: result.message,
        });
        anyFailure = true;
      }
    } catch (err) {
      updatedTargets.push({ ...target, status: "failed", attempts, lastError: (err as Error).message });
      anyFailure = true;
    }
  }

  const allDone = updatedTargets.every((t) => ["published", "failed", "cancelled"].includes(t.status));
  const allPublished = updatedTargets.every((t) => t.status === "published");
  const newStatus = allPublished ? "published" : allDone ? (anySuccess ? "published" : "failed") : "publishing";

  await updateContentRecord(row.id, {
    platformTargets: updatedTargets,
    publishResults,
    status: newStatus,
    lockedBy: null,
    lockedAt: null,
    error: anyFailure ? { message: "یک یا چند پلتفرم با خطا مواجه شدند.", at: nowUtcIso() } : null,
  });

  await appendAuditEvent({
    action: "publish_attempt",
    entityType: "content",
    entityId: row.id,
    before: { status: row.status },
    after: { status: newStatus, targets: updatedTargets },
  });

  // Notifications + archive/error topic postings (best-effort, never throws).
  try {
    if (client) {
      const [publishedTopic] = await db.select().from(telegramTopics).where(eq(telegramTopics.key, "published")).limit(1);
      const [errorsTopic] = await db.select().from(telegramTopics).where(eq(telegramTopics.key, "errors")).limit(1);
      if (anySuccess) {
        await client.sendMessage(
          buildTgdbMessage("publish_success", { content_id: row.id, title: row.title, targets: updatedTargets }),
          publishedTopic?.messageThreadId ?? undefined,
        );
      }
      if (anyFailure) {
        await client.sendMessage(
          buildTgdbMessage("publish_error", { content_id: row.id, title: row.title, targets: updatedTargets }),
          errorsTopic?.messageThreadId ?? undefined,
        );
      }
    }
    const when = row.scheduledAtUtc ? formatJalaliDateTime(row.scheduledAtUtc) : formatJalaliDateTime(nowUtcIso());
    if (row.createdBy) {
      const { db: dbRef } = await import("@/db");
      const { users } = await import("@/db/schema");
      const [creatorUser] = await dbRef.select().from(users).where(eq(users.id, row.createdBy)).limit(1);
      if (creatorUser) {
        const statusText = anySuccess && !anyFailure ? "با موفقیت منتشر شد ✅" : anyFailure ? "با خطا مواجه شد ❌" : "در حال انتشار است ⏳";
        await notifyUser(
          creatorUser.telegramId,
          `محتوای «${row.title || row.id}» ${statusText}\nزمان: ${when}\nشناسه: ${row.id}`,
        );
      }
    }
  } catch (err) {
    console.error("[worker] notification/logging step failed:", (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Auto-refresh of Instagram long-lived tokens (keeps connections permanent).
// Instagram has no refresh token, so we re-issue the long-lived token before
// it expires (~60 days) by calling the refresh endpoint. Runs on a throttle
// inside the worker tick.
// ---------------------------------------------------------------------------
let lastTokenRefreshCheck = 0;
const TOKEN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // scan at most every 6h
const TOKEN_REFRESH_THRESHOLD_MS = 10 * 24 * 60 * 60 * 1000; // refresh if < 10 days left

export async function refreshExpiringInstagramTokens(): Promise<number> {
  const now = Date.now();
  if (now - lastTokenRefreshCheck < TOKEN_REFRESH_INTERVAL_MS) return 0;
  lastTokenRefreshCheck = now;

  const igAccounts = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.platform, "instagram"), eq(socialAccounts.connectionStatus, "connected")));

  let refreshed = 0;
  for (const acc of igAccounts) {
    if (!acc.credentialRef) continue;
    const [cred] = await db.select().from(credentials).where(eq(credentials.id, acc.credentialRef)).limit(1);
    if (!cred) continue;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(decryptSecret(cred.encryptedPayload));
    } catch {
      continue;
    }

    const expiresAt = Number(payload.expiresAt ?? 0);
    // Skip only if we know the token is still comfortably fresh.
    if (expiresAt && expiresAt - now > TOKEN_REFRESH_THRESHOLD_MS) continue;

    try {
      const refreshedToken = await refreshInstagramToken(String(payload.accessToken ?? ""));
      const newExpiresAt = refreshedToken.expiresIn
        ? now + refreshedToken.expiresIn * 1000
        : now + 60 * 24 * 60 * 60 * 1000;
      const newPayload = { ...payload, accessToken: refreshedToken.accessToken, expiresAt: newExpiresAt };
      await db
        .update(credentials)
        .set({ encryptedPayload: encryptSecret(JSON.stringify(newPayload)), updatedAt: new Date() })
        .where(eq(credentials.id, cred.id));
      refreshed++;
    } catch (err) {
      console.error("[worker] failed to refresh instagram token for account", acc.id, ":", (err as Error).message);
    }
  }

  return refreshed;
}
