"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import type { ContentRoomProductSummary } from "./types";
import { channelLabelFa, productTypeLabelFa, getProductProgress, getNextAction } from "./room-model";
import { contentStatusPresentation } from "@/lib/content-room/presentation";

interface Props {
  products: readonly ContentRoomProductSummary[];
  onArchive?: (product: ContentRoomProductSummary) => void;
  onUnarchive?: (product: ContentRoomProductSummary) => void;
}

export function ContentRoomTable({ products, onArchive, onUnarchive }: Props) {
  return (
    <div className="hidden lg:block" dir="rtl">
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-tg-border bg-tg-hover/40 text-xs text-tg-secondary">
              <tr>
                <th className="px-3 py-3 text-right font-semibold">محصول</th>
                <th className="px-3 py-3 text-right font-semibold">نوع</th>
                <th className="px-3 py-3 text-right font-semibold">کانال</th>
                <th className="px-3 py-3 text-center font-semibold">تعداد قسمت</th>
                <th className="px-3 py-3 text-right font-semibold">وضعیت</th>
                <th className="px-3 py-3 text-right font-semibold">پیشرفت</th>
                <th className="px-3 py-3 text-right font-semibold">اقدام بعدی</th>
                <th className="px-3 py-3 text-center font-semibold">آرشیو</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const pres = contentStatusPresentation(p.status as never);
                const progress = getProductProgress(p.status);
                const next = getNextAction(p.status);
                return (
                  <tr key={p.id} className="border-b border-tg-border hover:bg-tg-hover/50">
                    <td className="px-3 py-3">
                      <Link href={`/content-room/${p.id}`} className="font-semibold text-tg-accent hover:underline">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-tg-text">{productTypeLabelFa(p.productType)}</td>
                    <td className="px-3 py-3 text-tg-text">{channelLabelFa(p.channel)}</td>
                    <td className="px-3 py-3 text-center text-tg-text">{p.partsCount}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
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
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-[120px]">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-tg-text">{progress.label}</span>
                          <span className="text-tg-secondary">
                            {p.partsCount ? `${p.partsCount} قسمت` : "—"}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-tg-hover">
                          <div className="h-full rounded-full bg-tg-accent" style={{ width: `${progress.percent}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center rounded-full bg-tg-hover px-2 py-1 text-xs font-medium text-tg-text">
                        {next ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {p.archivedAt ? (
                        <button
                          onClick={() => onUnarchive?.(p)}
                          className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
                          aria-label={`بازیابی ${p.title}`}
                        >
                          بازیابی{p.isCold ? " · سرد" : ""}
                        </button>
                      ) : (
                        <button
                          onClick={() => onArchive?.(p)}
                          className="rounded-full bg-slate-500/10 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-500/20 dark:text-slate-300"
                          aria-label={`بایگانی ${p.title}`}
                        >
                          بایگانی
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
