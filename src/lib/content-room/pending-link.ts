// Pending "reply to a group message to link it" sessions — in-memory per process,
// with short TTL. Survives HMR via globalThis.
export interface PendingReplyLink {
  userId: string;
  partId: string;
  partNumber: number;
  kind: "video" | "cover" | "highlight" | "reel";
  createdAt: number;
  expiresAt: number;
}

const TTL_MS = 5 * 60_000; // 5 minutes

const globalStore = globalThis as unknown as { __partLinkPending?: Map<string, PendingReplyLink> };

function map(): Map<string, PendingReplyLink> {
  if (!globalStore.__partLinkPending) globalStore.__partLinkPending = new Map();
  return globalStore.__partLinkPending;
}

export function setPendingReply(telegramId: string, data: Omit<PendingReplyLink, "createdAt" | "expiresAt">): PendingReplyLink {
  const now = Date.now();
  const entry: PendingReplyLink = { ...data, createdAt: now, expiresAt: now + TTL_MS };
  map().set(telegramId, entry);
  return entry;
}

export function getPendingReply(telegramId: string): PendingReplyLink | null {
  const entry = map().get(telegramId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    map().delete(telegramId);
    return null;
  }
  return entry;
}

export function consumePendingReply(telegramId: string): PendingReplyLink | null {
  const entry = getPendingReply(telegramId);
  if (entry) map().delete(telegramId);
  return entry;
}

export function clearPendingReply(telegramId: string): void {
  map().delete(telegramId);
}

export function pendingTtlSeconds(entry: PendingReplyLink): number {
  return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
}
