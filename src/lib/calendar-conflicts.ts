/**
 * Channel conflict detection for calendar scheduling.
 * Groups events by channel (or fallback platform+account) and detects overlaps
 * within a time window (default 60 minutes). Also supports same-day detection.
 */

export interface ConflictEvent {
  contentId: string;
  publicationId?: string | null;
  title: string;
  platform: string;
  accountId: string;
  channel?: string | null;
  publishAtUtc: string;
}

export interface ConflictInfo {
  conflictingTitles: string[];
  conflictingIds: string[];
}

export function getConflictGroupKey(e: ConflictEvent): string {
  if (e.channel) return `channel:${e.channel}`;
  // fallback: same platform + same account is considered same channel
  return `${e.platform}:${e.accountId}`;
}

export function eventKey(e: ConflictEvent): string {
  return `${e.contentId}:${e.platform}:${e.accountId}:${e.publicationId ?? ""}`;
}

export function getEventUid(e: ConflictEvent): string {
  // stable uid for maps
  if (e.publicationId) return `pub:${e.publicationId}`;
  return `cnt:${e.contentId}:${e.platform}:${e.accountId}`;
}

/**
 * Detect conflicts: for each group, sort by time, then sliding window.
 * Within `windowMinutes`, events are conflicting.
 * Returns maps for quick lookup.
 */
export function detectChannelConflicts(
  events: ConflictEvent[],
  windowMinutes = 60
): {
  conflictIds: Set<string>;
  conflictMap: Map<string, ConflictInfo>;
  totalConflicts: number;
} {
  const conflictIds = new Set<string>();
  const conflictMap = new Map<string, ConflictInfo>();
  const windowMs = windowMinutes * 60 * 1000;

  const groups = new Map<string, ConflictEvent[]>();
  for (const ev of events) {
    if (!ev.publishAtUtc) continue;
    const key = getConflictGroupKey(ev);
    const arr = groups.get(key) ?? [];
    arr.push(ev);
    groups.set(key, arr);
  }

  for (const [, group] of groups) {
    // sort by publish time asc
    const sorted = [...group].sort(
      (a, b) => new Date(a.publishAtUtc).getTime() - new Date(b.publishAtUtc).getTime()
    );
    // sliding window: for each i, check subsequent j within window
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const aTime = new Date(a.publishAtUtc).getTime();
      if (Number.isNaN(aTime)) continue;
      const aUid = getEventUid(a);
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        const bTime = new Date(b.publishAtUtc).getTime();
        if (Number.isNaN(bTime)) continue;
        const diff = Math.abs(bTime - aTime);
        if (diff > windowMs) break; // since sorted, further will be larger
        // conflict between a and b
        const bUid = getEventUid(b);
        conflictIds.add(aUid);
        conflictIds.add(bUid);

        // populate map for a
        const infoA = conflictMap.get(aUid) ?? { conflictingTitles: [], conflictingIds: [] };
        if (!infoA.conflictingIds.includes(bUid)) {
          infoA.conflictingTitles.push(b.title);
          infoA.conflictingIds.push(bUid);
          conflictMap.set(aUid, infoA);
        }
        // populate map for b
        const infoB = conflictMap.get(bUid) ?? { conflictingTitles: [], conflictingIds: [] };
        if (!infoB.conflictingIds.includes(aUid)) {
          infoB.conflictingTitles.push(a.title);
          infoB.conflictingIds.push(aUid);
          conflictMap.set(bUid, infoB);
        }
      }
    }
  }

  return { conflictIds, conflictMap, totalConflicts: conflictIds.size };
}

/**
 * Check if dropping `candidate` at new time would conflict with existing events.
 * Excludes itself from comparison.
 */
export function wouldConflict(
  candidate: ConflictEvent,
  events: ConflictEvent[],
  windowMinutes = 60
): { hasConflict: boolean; conflictingTitles: string[] } {
  const windowMs = windowMinutes * 60 * 1000;
  const candTime = new Date(candidate.publishAtUtc).getTime();
  const candKey = getConflictGroupKey(candidate);
  const candUid = getEventUid(candidate);
  const conflictingTitles: string[] = [];
  for (const ev of events) {
    if (getEventUid(ev) === candUid) continue;
    if (getConflictGroupKey(ev) !== candKey) continue;
    const evTime = new Date(ev.publishAtUtc).getTime();
    if (Number.isNaN(evTime) || Number.isNaN(candTime)) continue;
    if (Math.abs(evTime - candTime) <= windowMs) {
      conflictingTitles.push(ev.title);
    }
  }
  return { hasConflict: conflictingTitles.length > 0, conflictingTitles };
}

export function formatConflictTooltip(titles: string[]): string {
  if (titles.length === 0) return "";
  return `تداخل کانال: هم‌زمان با ${titles.join("، ")}`;
}

/**
 * Same-day conflict detection (alternative window = entire day).
 * Useful for daily view highlighting.
 */
export function detectSameDayConflicts(events: ConflictEvent[]): ReturnType<typeof detectChannelConflicts> {
  // group by channel + date (Asia/Tehran day) then mark >1 per day as conflict
  // Simple approximation: group by YYYY-MM-DD of UTC date's Tehran conversion via Date
  // For now reuse 24h window with grouping by key only: use large window
  return detectChannelConflicts(events, 24 * 60);
}
