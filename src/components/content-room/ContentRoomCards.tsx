"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import type { ContentRoomProductSummary } from "./types";
import { CHANNEL_LABELS, PRODUCT_TYPE_LABELS, getProductProgress, getNextAction } from "./room-model";
import { contentStatusPresentation } from "@/lib/content-room/presentation";

interface Props {
  products: readonly ContentRoomProductSummary[];
  onArchive?: (product: ContentRoomProductSummary) => void;
  onUnarchive?: (product: ContentRoomProductSummary) => void;
}

export function ContentRoomCards({ products, onArchive, onUnarchive }: Props) {
  return (
    <div className="grid gap-4 lg:hidden" dir="rtl">
      {products.map((p) => {
        const pres = contentStatusPresentation(p.status as never);
        const progress = getProductProgress(p.status);
        const next = getNextAction(p.status);
        return (
          <Card key={p.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/content-room/${p.id}`} className="line-clamp-1 font-semibold text-tg-accent hover:underline">
                  {p.title}
                </Link>
                <p className="text-xs text-tg-secondary">
                  {PRODUCT_TYPE_LABELS[p.productType] ?? p.productType} · {CHANNEL_LABELS[p.channel] ?? p.channel}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                  pres.tone === "success"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : pres.tone === "warning"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      : pres.tone === "info"
                        ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
                        : "bg-slate-500/10 text-slate-600 dark:text-slate-300"
                }`}
              >
                {pres.label}
              </span>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-tg-secondary">پیشرفت</span>
                <span className="font-medium text-tg-text">{progress.label}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-tg-hover">
                <div className="h-full rounded-full bg-tg-accent" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-tg-secondary">{p.partsCount} قسمت</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-tg-hover/50 px-3 py-2">
                <p className="text-tg-secondary">تعداد قسمت</p>
                <p className="font-medium text-tg-text">{p.partsCount}</p>
              </div>
              <div className="rounded-lg bg-tg-hover/50 px-3 py-2">
                <p className="text-tg-secondary">اقدام بعدی</p>
                <p className="font-medium text-tg-text">{next ?? "—"}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              {p.archivedAt ? (
                <button
                  onClick={() => onUnarchive?.(p)}
                  className="flex-1 rounded-lg bg-amber-500/15 py-2 text-xs font-medium text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
                >
                  بازگردانی{p.isCold ? " · آرشیو سرد" : ""}
                </button>
              ) : (
                <button
                  onClick={() => onArchive?.(p)}
                  className="flex-1 rounded-lg bg-slate-500/10 py-2 text-xs font-medium text-slate-600 hover:bg-slate-500/15 dark:text-slate-300"
                >
                  آرشیو
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
