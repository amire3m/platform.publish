"use client";

import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { EXEC_SUMMARY, BOARD_CHANNELS } from "@/lib/board/channels";
import { useBoardDataset } from "@/lib/board/store";
import { filterRows, liveMetaFor, liveTotals, totals } from "@/lib/board/stats";
import { SourceBadge, fmt } from "@/components/board/badges";

export default function BoardOverviewPage() {
  const { dataset } = useBoardDataset();
  const live = dataset.source === "live";
  const t = totals(dataset.rows);
  const lt = liveTotals(dataset);
  const cards = live
    ? [
        { label: "مجموع بازدید کانال‌ها", value: fmt(lt.views) },
        { label: "مجموع مشترک‌ها", value: fmt(lt.subs) },
        { label: "مجموع ویدیوها", value: fmt(lt.videos) },
        { label: "میانگین بازدید هر ویدیو", value: fmt(lt.videos ? Math.round(lt.views / lt.videos) : 0) },
      ]
    : [
        { label: "مجموع بازدید", value: fmt(t.views) },
        { label: "مشترک جدید (خالص)", value: fmt(t.subsGained - t.subsLost) },
        { label: "ویدیوها", value: fmt(t.videos) },
        { label: "میانگین بازدید هر ویدیو", value: fmt(t.avgViews) },
      ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-tg-text">خلاصه مدیریتی</h2>
        <SourceBadge source={dataset.source} />
      </div>
      <Card className="space-y-2">
        {EXEC_SUMMARY.map((s) => (
          <p key={s} className="flex gap-2 text-sm leading-6 text-tg-text">
            <span aria-hidden="true" className="text-tg-accent">✓</span>
            <span>{s}</span>
          </p>
        ))}
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="text-center">
            <p className="text-xl font-black tabular-nums text-tg-text">{c.value}</p>
            <p className="mt-1 text-xs text-tg-secondary">{c.label}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {BOARD_CHANNELS.map((ch) => {
          const meta = liveMetaFor(dataset, ch.id);
          const ct = totals(filterRows(dataset.rows, { channels: [ch.nameFa] }));
          const views = meta?.views ?? ct.views;
          const subs = meta?.subs ?? ct.subsGained - ct.subsLost;
          const count = meta?.videos ?? ct.videos;
          return (
            <Card key={ch.id} className="flex items-center gap-3">
              {ch.imageUrl ? (
                <img src={ch.imageUrl} alt={`تصویر کانال ${ch.nameFa}`} loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-black text-white" style={{ backgroundColor: ch.color }} aria-hidden="true">
                  {ch.monogram}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-tg-text">{ch.nameFa}</p>
                <p className="truncate text-xs text-tg-secondary">{ch.progressNote}</p>
              </div>
              <div className="shrink-0 text-left text-xs tabular-nums text-tg-text">
                <p>{fmt(views)} بازدید</p>
                <p className="text-tg-secondary">{fmt(subs)} مشترک</p>
                <p className="text-tg-secondary">{fmt(count)} ویدیو</p>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/board/channels"><Button variant="secondary" className="min-h-[44px]">معرفی کانال‌ها</Button></Link>
        <Link href="/board/dashboard"><Button className="min-h-[44px]">داشبورد آماری</Button></Link>
        <Link href="/board/meeting"><Button variant="secondary" className="min-h-[44px]">گزارش جلسه</Button></Link>
      </div>
    </div>
  );
}
