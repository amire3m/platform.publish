export const PART_ACTIVITIES = [
  "raw_telegram",
  "raw_compressed",
  "yt_check_upload",
  "copyright_report",
  "music_replaced",
  "final_full",
  "cover_ready",
  "highlight_done",
  "reel_done",
  "previously_published",
] as const;

export type PartActivity = (typeof PART_ACTIVITIES)[number];

export const REQUIRED_FOR_SEND: PartActivity[] = [
  "raw_telegram",
  "raw_compressed",
  "yt_check_upload",
  "copyright_report",
  "music_replaced",
  "final_full",
  "cover_ready",
  "highlight_done",
  "reel_done",
];

/** Canonical Persian labels for part activities (single source of truth). */
export const ACTIVITY_LABELS_FA: Record<PartActivity, string> = {
  raw_telegram: "خام تلگرام",
  raw_compressed: "نسخه هندبریک",
  yt_check_upload: "آپلود چک یوتیوب",
  copyright_report: "گزارش کپی‌رایت",
  music_replaced: "موسیقی جایگزین",
  final_full: "نسخه نهایی",
  cover_ready: "کاور",
  highlight_done: "برش",
  reel_done: "ریلز",
  previously_published: "قبلاً منتشر شده",
};

/** Which job function owns each activity (drives the task queue). */
export const ACTIVITY_JOB_MAP: Record<string, string[]> = {
  raw_telegram: ["full_editor"],
  raw_compressed: ["full_editor"],
  yt_check_upload: ["full_editor"],
  copyright_report: ["full_editor"],
  music_replaced: ["full_editor"],
  final_full: ["full_editor"],
  highlight_done: ["reel_editor"],
  reel_done: ["reel_editor"],
  cover_ready: ["graphic"],
};

export function deriveProductStatusFromParts(
  parts: Array<{ isActive: boolean; activities: Record<string, boolean> }>,
): string {
  const active = parts.filter((p) => p.isActive && !p.activities.previously_published);
  if (active.length === 0 && parts.some((p) => p.isActive && p.activities.previously_published)) {
    return "previously_published";
  }
  if (active.length > 0 && active.every((p) => REQUIRED_FOR_SEND.every((a) => p.activities[a]))) {
    return "ready_to_send";
  }
  return "imported";
}

/**
 * Per-part publish readiness: a single part is publishable when all required
 * activities (except the previously_published marker) are checked for THAT part.
 */
export function isPartReadyForSend(activities: Record<string, boolean> | null | undefined): boolean {
  const a = activities ?? {};
  return REQUIRED_FOR_SEND.every((k) => !!a[k]);
}

export interface ReconcilablePart {
  id: string;
  partNumber: number;
  isActive: boolean;
}

export interface PartsReconciliationPlan {
  deactivateIds: string[];
  reactivateIds: string[];
  newPartNumbers: number[];
}

/**
 * Plans how content_parts rows must change when a product's partsCount changes.
 * Converges the rows so the active count always equals the new count:
 * - hide active parts with partNumber above the new count (decrease rule),
 * - then reactivate hidden parts (ascending partNumber) first,
 * - then allocate fresh sequential partNumbers after the current max.
 * Matches the InMemory semantics used by updateProductMetadata in every
 * reachable state, and additionally converges when flags have gaps.
 */
export function planPartsReconciliation(
  parts: readonly ReconcilablePart[],
  newCount: number,
): PartsReconciliationPlan {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const deactivateIds = sorted.filter((p) => p.isActive && p.partNumber > newCount).map((p) => p.id);
  const deactivated = new Set(deactivateIds);
  const activeAfterHide = sorted.filter((p) => p.isActive && !deactivated.has(p.id));
  const hiddenAfterHide = sorted.filter((p) => !p.isActive || deactivated.has(p.id));
  const reactivateIds: string[] = [];
  for (const h of hiddenAfterHide) {
    if (activeAfterHide.length + reactivateIds.length >= newCount) break;
    reactivateIds.push(h.id);
  }
  const maxNum = sorted.reduce((max, p) => Math.max(max, p.partNumber), 0);
  const stillNeed = newCount - activeAfterHide.length - reactivateIds.length;
  const newPartNumbers: number[] = [];
  for (let i = 1; i <= stillNeed; i++) newPartNumbers.push(maxNum + i);
  return { deactivateIds, reactivateIds, newPartNumbers };
}
