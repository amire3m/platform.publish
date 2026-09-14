// Pending "create product from Telegram" sessions armed by link_new.
// Steps: title (text reply) → type (link_new_type) → channel (link_new_channel).
// In-memory per process, with short TTL. Survives HMR via globalThis.
export interface PendingNewProduct {
  messageId: string;
  title?: string;
  productType?: string;
  channel?: string;
  createdAt: number;
  expiresAt: number;
}

const TTL_MS = 5 * 60_000; // 5 minutes

const globalStore = globalThis as unknown as { __newProductPending?: Map<string, PendingNewProduct> };

function map(): Map<string, PendingNewProduct> {
  if (!globalStore.__newProductPending) globalStore.__newProductPending = new Map();
  return globalStore.__newProductPending;
}

export function setPendingNewProduct(telegramId: string, data: Omit<PendingNewProduct, "createdAt" | "expiresAt"> & Partial<Pick<PendingNewProduct, "title" | "productType" | "channel">>): PendingNewProduct {
  const now = Date.now();
  const prev = map().get(telegramId);
  const entry: PendingNewProduct = { messageId: data.messageId, title: data.title ?? prev?.title, productType: data.productType ?? prev?.productType, channel: data.channel ?? prev?.channel, createdAt: prev?.createdAt ?? now, expiresAt: now + TTL_MS };
  map().set(telegramId, entry);
  return entry;
}

export function getPendingNewProduct(telegramId: string): PendingNewProduct | null {
  const entry = map().get(telegramId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    map().delete(telegramId);
    return null;
  }
  return entry;
}

export function clearPendingNewProduct(telegramId: string): void {
  map().delete(telegramId);
}
