import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workflowDeliverables, workflowPrograms, workflowPublications, youtubeStatusSnapshots } from "@/db/schema";

// ---------------------------------------------------------------------------
// YouTube status watch (copyright layer 1 — pure Data API v3).
// Polls videos.list(part=status) for our published externalIds and raises an
// alert when YouTube blocked/rejected/removed a video or its privacy changed.
// Soft Content ID claims (video stays up, claimant takes revenue) are NOT
// visible in the API — those need the mailbox layer.
// ---------------------------------------------------------------------------

export interface VideoStatus {
  videoId: string;
  uploadStatus: string | null;
  rejectionReason: string | null;
  privacyStatus: string | null;
  /** Video disappeared from the API (takedown / deleted / private-hidden). */
  missing: boolean;
}

export interface StatusChange {
  publicationId: string;
  deliverableName: string;
  programTitle: string;
  accountId: string;
  externalId: string;
  kind: "rejected_claim" | "rejected_copyright" | "rejected_other" | "deleted" | "failed" | "privacy_changed";
  message: string;
  detail: string;
}

const REJECTION_FA: Record<string, string> = {
  claim: "بلاک توسط صاحب اثر (Content ID)",
  copyright: "نقض کپی‌رایت",
  trademark: "نقض علامت تجاری",
  termsOfUse: "نقض قوانین یوتیوب",
  legal: "محدودیت قانونی",
  duplicate: "آپلود تکراری",
  inappropriate: "محتوای نامناسب",
  length: "محدودیت مدت",
  uploaderAccountSuspended: "تعلیق حساب",
  uploaderAccountClosed: "بسته شدن حساب",
};

function messageFor(curr: VideoStatus): StatusChange["kind"] | null {
  if (curr.missing) return "deleted";
  if (curr.uploadStatus === "rejected") {
    if (curr.rejectionReason === "claim") return "rejected_claim";
    if (curr.rejectionReason === "copyright") return "rejected_copyright";
    return "rejected_other";
  }
  if (curr.uploadStatus === "failed") return "failed";
  return null;
}

export function detectChanges(
  prev: { uploadStatus: string | null; rejectionReason: string | null; privacyStatus: string | null } | null,
  curr: VideoStatus,
  meta: { publicationId: string; deliverableName: string; programTitle: string; accountId: string; externalId: string },
): StatusChange | null {
  const kind = messageFor(curr);
  if (kind) {
    // Alert once per new terminal state (avoid repeats for the same state)
    if (prev && prev.uploadStatus === curr.uploadStatus && (prev.rejectionReason ?? null) === (curr.rejectionReason ?? null)) return null;
    const detail =
      kind === "deleted"
        ? "ویدیو دیگر در یوتیوب یافت نشد (حذف یا takedown)."
        : kind === "failed"
          ? "پردازش ویدیو در یوتیوب ناموفق بود."
          : `یوتیوب ویدیو را رد کرد: ${REJECTION_FA[curr.rejectionReason ?? ""] ?? curr.rejectionReason ?? "نامشخص"}.`;
    return { ...meta, kind, message: detail, detail };
  }
  if (prev && prev.privacyStatus && curr.privacyStatus && prev.privacyStatus !== curr.privacyStatus) {
    return {
      ...meta,
      kind: "privacy_changed",
      message: `وضعیت حریم ویدیو تغییر کرد: ${prev.privacyStatus} ← ${curr.privacyStatus}.`,
      detail: `privacy ${prev.privacyStatus} -> ${curr.privacyStatus}`,
    };
  }
  return null;
}

export interface StatusWatchDeps {
  listStatuses?: (accountId: string, videoIds: string[]) => Promise<VideoStatus[]>;
  alert?: (change: StatusChange) => Promise<void>;
}

async function defaultListStatuses(accountId: string, videoIds: string[]): Promise<VideoStatus[]> {
  try {
    const { getAccountClient, getVideosStatus } = await import("./gateway");
    const client = await getAccountClient(accountId);
    return await getVideosStatus(client, videoIds);
  } catch (e) {
    // No credential / quota / API failure → no false alerts
    console.error(`[status-watch] videos.list failed for ${accountId}:`, (e as Error).message);
    return [];
  }
}

async function defaultAlert(change: StatusChange): Promise<void> {
  // Panel: flag the publication (visible in publish room detail)
  try {
    await db
      .update(workflowPublications)
      .set({ lastErrorCode: "YOUTUBE_STATUS", lastErrorMessage: change.message, updatedAt: new Date() } as never)
      .where(eq(workflowPublications.id, change.publicationId));
  } catch (e) {
    console.error("[status-watch] flag publication failed:", (e as Error).message);
  }
  // Telegram: errors topic
  try {
    const { getTelegramConfig, TelegramClient } = await import("@/lib/telegram/client");
    const cfg = getTelegramConfig();
    if (!cfg) return;
    const client = new TelegramClient(cfg);
    const { telegramTopics } = await import("@/db/schema");
    const [topic] = await db.select().from(telegramTopics).where(eq(telegramTopics.key, "errors")).limit(1);
    const text = `⚠️ هشدار یوتیوب\n🎬 ${change.deliverableName}\n📁 ${change.programTitle}\n🔗 https://youtu.be/${change.externalId}\n${change.message}`;
    await client.sendMessage(text, topic?.messageThreadId ?? undefined);
  } catch (e) {
    console.error("[status-watch] telegram alert failed:", (e as Error).message);
  }
}

interface WatchedPub {
  publicationId: string;
  accountId: string;
  externalId: string;
  deliverableName: string;
  programTitle: string;
}

export async function runStatusWatchTick(deps?: StatusWatchDeps): Promise<{ checked: number; alerts: number }> {
  const listStatuses = deps?.listStatuses ?? defaultListStatuses;
  const alert = deps?.alert ?? defaultAlert;

  // All published youtube pubs with an external video id (not archived)
  const rows = (await db
    .select({
      publicationId: workflowPublications.id,
      accountId: workflowPublications.socialAccountId,
      externalId: workflowPublications.externalId,
      deliverableName: workflowDeliverables.name,
      programTitle: workflowPrograms.title,
    })
    .from(workflowPublications)
    .innerJoin(workflowDeliverables, eq(workflowPublications.deliverableId, workflowDeliverables.id))
    .innerJoin(workflowPrograms, eq(workflowDeliverables.programId, workflowPrograms.id))
    .where(
      and(eq(workflowPublications.platform, "youtube"), eq(workflowPublications.status, "published")),
    )
    .limit(500)) as unknown as Array<{
    publicationId: string;
    accountId: string | null;
    externalId: string | null;
    deliverableName: string;
    programTitle: string;
  }>;

  const pubs: WatchedPub[] = rows.filter((r) => r.accountId && r.externalId) as WatchedPub[];
  const byAccount = new Map<string, WatchedPub[]>();
  for (const p of pubs) {
    const list = byAccount.get(p.accountId) ?? [];
    list.push(p);
    byAccount.set(p.accountId, list);
  }

  let checked = 0;
  let alerts = 0;
  for (const [accountId, list] of byAccount) {
    const statuses = await listStatuses(accountId, list.map((p) => p.externalId));
    const byVideo = new Map(statuses.map((s) => [s.videoId, s]));
    for (const p of list) {
      const curr = byVideo.get(p.externalId);
      if (!curr) continue;
      checked++;
      const [prev] = (await db
        .select()
        .from(youtubeStatusSnapshots)
        .where(eq(youtubeStatusSnapshots.publicationId, p.publicationId))
        .limit(1)) as unknown as Array<{ uploadStatus: string | null; rejectionReason: string | null; privacyStatus: string | null }>;
      const change = detectChanges(prev ?? null, curr, {
        publicationId: p.publicationId,
        deliverableName: p.deliverableName,
        programTitle: p.programTitle,
        accountId: p.accountId,
        externalId: p.externalId,
      });
      // Upsert snapshot
      try {
        await db
          .insert(youtubeStatusSnapshots)
          .values({
            publicationId: p.publicationId,
            accountId: p.accountId,
            externalId: p.externalId,
            uploadStatus: curr.uploadStatus,
            rejectionReason: curr.rejectionReason,
            privacyStatus: curr.privacyStatus,
            checkedAt: new Date(),
            updatedAt: new Date(),
          } as never)
          .onConflictDoUpdate({
            target: youtubeStatusSnapshots.publicationId,
            set: {
              uploadStatus: curr.uploadStatus,
              rejectionReason: curr.rejectionReason,
              privacyStatus: curr.privacyStatus,
              checkedAt: new Date(),
              updatedAt: new Date(),
            } as never,
          });
      } catch (e) {
        console.error("[status-watch] snapshot upsert failed:", (e as Error).message);
      }
      if (change) {
        alerts++;
        await alert(change);
      }
    }
  }
  return { checked, alerts };
}
