export const PART_ACTIVITIES = [
  "editing_youtube",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
  "previously_published",
] as const;

export type PartActivity = (typeof PART_ACTIVITIES)[number];

export const REQUIRED_FOR_SEND: PartActivity[] = [
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
