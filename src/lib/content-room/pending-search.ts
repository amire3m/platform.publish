// Pending product-search sessions armed from the Telegram picker ("🔍 جستجو").
// In-memory per process, with short TTL. Survives HMR via globalThis.
export interface PendingProductSearch {
  messageId: string;
  createdAt: number;
  expiresAt: number;
}

const TTL_MS = 5 * 60_000; // 5 minutes

const globalStore = globalThis as unknown as { __productSearchPending?: Map<string, PendingProductSearch> };

function map(): Map<string, PendingProductSearch> {
  if (!globalStore.__productSearchPending) globalStore.__productSearchPending = new Map();
  return globalStore.__productSearchPending;
}

export function setPendingSearch(telegramId: string, data: Omit<PendingProductSearch, "createdAt" | "expiresAt">): PendingProductSearch {
  const now = Date.now();
  const entry: PendingProductSearch = { ...data, createdAt: now, expiresAt: now + TTL_MS };
  map().set(telegramId, entry);
  return entry;
}

export function getPendingSearch(telegramId: string): PendingProductSearch | null {
  const entry = map().get(telegramId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    map().delete(telegramId);
    return null;
  }
  return entry;
}

export function consumePendingSearch(telegramId: string): PendingProductSearch | null {
  const entry = getPendingSearch(telegramId);
  if (entry) map().delete(telegramId);
  return entry;
}

export function clearPendingSearch(telegramId: string): void {
  map().delete(telegramId);
}
