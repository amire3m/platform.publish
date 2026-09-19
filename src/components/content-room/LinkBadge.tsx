"use client";

import type { ContentRoomProductSummary } from "./types";

export interface LinkBadgeState {
  total: number;
  linked: number;
  complete: boolean;
  label: string;
}

export function linkBadgeState(p: ContentRoomProductSummary): LinkBadgeState {
  const total = p.linkTotal ?? p.partsCount ?? 0;
  const linked = p.linkedParts ?? 0;
  const complete = total > 0 && linked >= total;
  return {
    total,
    linked,
    complete,
    label: total === 0 ? "بدون قسمت" : complete ? "همه لینک شده" : `${total - linked} لینک‌نشده`,
  };
}

/** Per-part video-link badge for the product list (no need to open the product). */
export function LinkBadge({ product }: { product: ContentRoomProductSummary }) {
  const s = linkBadgeState(product);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        s.complete
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      }`}
      title={s.total > 0 ? `${s.linked} از ${s.total} قسمت لینک شده` : undefined}
    >
      {s.total > 0 ? `${s.linked}/${s.total} ` : ""}
      {s.label}
    </span>
  );
}
