import {
  ACTIVITY_JOB_MAP,
  ACTIVITY_LABELS_FA,
  PART_ACTIVITIES,
} from "./content-room/activities";
import { normalizeJobFunctions, type JobFunction } from "./job-functions";

export interface PartTaskInput {
  partId: string;
  productId: string;
  productTitle: string;
  channel: string;
  channelLabel: string;
  partNumber: number;
  activities: Record<string, boolean>;
  previouslyPublished?: boolean;
}

export interface ChecklistTask {
  kind: "checklist";
  job: JobFunction;
  jobLabel: string;
  activity: string;
  activityLabel: string;
  partId: string;
  productId: string;
  productTitle: string;
  channel: string;
  channelLabel: string;
  partNumber: number;
  /** How many required steps remain for this job on this part (including this one). */
  remainingForJob: number;
  href: string;
}

const JOB_LABELS: Record<JobFunction, string> = {
  full_editor: "تدوینگر ویدیوی کامل",
  reel_editor: "تدوینگر ریلز و برش",
  graphic: "گرافیست",
  publisher_admin: "ادمین انتشار",
};

function jobActivities(job: JobFunction): string[] {
  return PART_ACTIVITIES.filter((a) => (ACTIVITY_JOB_MAP[a] ?? []).includes(job));
}

/**
 * Pure builder: first missing step per (part × job).
 * Skips inactive/previously-published parts and jobs with nothing missing.
 */
export function buildChecklistTasks(parts: PartTaskInput[], jobsRaw: unknown): ChecklistTask[] {
  const jobs = normalizeJobFunctions(jobsRaw);
  const out: ChecklistTask[] = [];
  for (const part of parts) {
    if (part.previouslyPublished) continue;
    const acts = part.activities ?? {};
    for (const job of jobs) {
      if (job === "publisher_admin") continue; // publication queue is separate
      const owned = jobActivities(job);
      const missing = owned.filter((a) => !acts[a]);
      if (missing.length === 0) continue;
      const activity = missing[0];
      out.push({
        kind: "checklist",
        job,
        jobLabel: JOB_LABELS[job],
        activity,
        activityLabel: ACTIVITY_LABELS_FA[activity as keyof typeof ACTIVITY_LABELS_FA] ?? activity,
        partId: part.partId,
        productId: part.productId,
        productTitle: part.productTitle,
        channel: part.channel,
        channelLabel: part.channelLabel,
        partNumber: part.partNumber,
        remainingForJob: missing.length,
        href: `/content-room/${part.productId}`,
      });
    }
  }
  return out;
}

export function isTasksAdmin(role: string | null | undefined, jobsRaw: unknown): boolean {
  if (role === "owner" || role === "manager") return true;
  return normalizeJobFunctions(jobsRaw).includes("publisher_admin");
}

export interface AssetCoverInput {
  assetId: string;
  assetKind: string;
  assetLabel: string;
  partId: string;
  productId: string;
  productTitle: string;
  channel: string;
  channelLabel: string;
  partNumber: number;
}

export interface AssetCoverTask {
  kind: "asset_cover";
  job: "graphic";
  jobLabel: string;
  assetId: string;
  assetKind: string;
  assetLabel: string;
  partId: string;
  productId: string;
  productTitle: string;
  channel: string;
  channelLabel: string;
  partNumber: number;
  href: string;
}

/**
 * One task per highlight/reel asset that has no cover yet — including parts
 * of already-published products (their YouTube versions still need thumbnails).
 */
export function buildAssetCoverTasks(assets: AssetCoverInput[], coveredAssetIds: Set<string> | ReadonlySet<string>): AssetCoverTask[] {
  const covered = coveredAssetIds;
  const out: AssetCoverTask[] = [];
  for (const a of assets) {
    if (covered.has(a.assetId)) continue;
    out.push({
      kind: "asset_cover",
      job: "graphic",
      jobLabel: "گرافیست",
      assetId: a.assetId,
      assetKind: a.assetKind,
      assetLabel: a.assetLabel,
      partId: a.partId,
      productId: a.productId,
      productTitle: a.productTitle,
      channel: a.channel,
      channelLabel: a.channelLabel,
      partNumber: a.partNumber,
      href: `/content-room/${a.productId}`,
    });
  }
  return out;
}
