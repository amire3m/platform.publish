export const PART_ACTIVITIES = [
  "raw_done",
  "editing_full_done",
  "editing_youtube",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
  "previously_published",
] as const;

export type PartActivity = (typeof PART_ACTIVITIES)[number];

export const REQUIRED_FOR_SEND: PartActivity[] = [
  "raw_done",
  "editing_full_done",
  "editing_youtube",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
];

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
