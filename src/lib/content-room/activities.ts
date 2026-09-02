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
