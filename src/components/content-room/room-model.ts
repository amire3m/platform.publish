import type { ContentRoomProductSummary, ContentRoomFilters } from "./types";
import { CONTENT_STATUS_ORDER, contentStatusPresentation } from "@/lib/content-room/presentation";
import type { ContentStatus } from "@/lib/content-room/presentation";
import { CHANNELS } from "@/lib/channels";
import { UNKNOWN_LABEL_FA } from "@/lib/presentation-fa";

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  serial: "سریال",
  documentary: "مستند",
  tv_program: "برنامه تلویزیونی",
  film: "فیلم سینمایی",
  short_film: "فیلم کوتاه",
  educational: "آموزشی",
};

export const CHANNEL_LABELS: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.id, c.labelFa]));

export const productTypeLabelFa = (value: string) => PRODUCT_TYPE_LABELS[value] ?? UNKNOWN_LABEL_FA;
export const channelLabelFa = (value: string) => CHANNEL_LABELS[value] ?? UNKNOWN_LABEL_FA;

export const STATUS_LABELS: Record<string, string> = {
  imported: "واردشده",
  editing_youtube: "در تدوین یوتیوب",
  copyright_fix: "رفع کپی‌رایت",
  highlight_done: "هایلایت ساخته شد",
  reel_done: "ریلز ساخته شد",
  cover_ready: "کاور آماده",
  ready_to_send: "آماده ارسال",
};

export function filterProducts(
  products: readonly ContentRoomProductSummary[],
  filters: ContentRoomFilters,
): ContentRoomProductSummary[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  const hasQuery = query.length > 0;
  const productType = filters.productType ?? "";
  const channel = filters.channel ?? "";
  const status = filters.status ?? "";

  return products.filter((p) => {
    if (!filters.includeArchived && p.archivedAt) return false;
    if (hasQuery) {
      const title = (p.title ?? "").toLowerCase();
      const notes = (p.notes ?? "").toLowerCase();
      if (!title.includes(query) && !notes.includes(query)) return false;
    }
    if (productType && p.productType !== productType) return false;
    if (channel && p.channel !== channel) return false;
    if (status && p.status !== status) return false;
    return true;
  });
}

export function contentRoomFilters(overrides: Partial<ContentRoomFilters> = {}): ContentRoomFilters {
  return {
    query: overrides.query ?? "",
    productType: overrides.productType ?? "",
    channel: overrides.channel ?? "",
    status: overrides.status ?? "",
    dateFrom: overrides.dateFrom ?? "",
    dateTo: overrides.dateTo ?? "",
    includeArchived: overrides.includeArchived ?? false,
    sort: overrides.sort ?? "",
  };
}

export function getProductProgress(status: string): { percent: number; label: string } {
  const order = CONTENT_STATUS_ORDER[status as ContentStatus];
  if (order === undefined) return { percent: 0, label: UNKNOWN_LABEL_FA };
  const percent = Math.round(((order + 1) / 7) * 100);
  return { percent, label: `${percent}٪` };
}

export function getNextAction(status: string): string | null {
  const order = CONTENT_STATUS_ORDER[status as ContentStatus];
  if (order === undefined) return null;
  if (status === "ready_to_send") return "آماده ارسال";
  const next = Object.entries(CONTENT_STATUS_ORDER).find(([, v]) => v === order + 1);
  if (!next) return null;
  return contentStatusPresentation(next[0] as ContentStatus).label;
}

export function summarizeContentRoom(products: readonly ContentRoomProductSummary[]) {
  const total = products.length;
  const byStatus: Record<string, number> = {};
  for (const p of products) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  }
  const ready = byStatus["ready_to_send"] ?? 0;
  return { total, readyCount: ready, byStatus };
}

// Re-export presentation for convenience
export { contentStatusPresentation };
