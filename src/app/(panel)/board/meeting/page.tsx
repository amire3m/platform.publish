"use client";

import { Button, Card } from "@/components/ui";
import { BOARD_CHANNELS } from "@/lib/board/channels";
import { useBoardDataset, downloadJson } from "@/lib/board/store";
import { totals } from "@/lib/board/stats";
import { useProduction } from "@/lib/board/production";
import { useCollection } from "@/components/board/CollectionManager";
import { fmt, fmtPct } from "@/components/board/badges";
import type { CollabItem, IdeaItem, LicenseItem } from "@/lib/board/types";

export default function BoardMeetingPage() {
  const { dataset } = useBoardDataset();
  const { items: prod } = useProduction();
  const { items: ideas } = useCollection<IdeaItem>("board-report:ideas:v1", []);
  const { items: collabs } = useCollection<CollabItem>("board-report:collabs:v1", []);
  const { items: licenses } = useCollection<LicenseItem>("board-report:licenses:v1", []);

  const perChannel = BOARD_CHANNELS.map((c) => {
    const rows = dataset.rows.filter((r) => r.channel === c.nameFa);
    const t = totals(rows);
    const subs = t.subsGained - t.subsLost;
    return { ...c, views: t.views, subs, count: rows.length };
  });
  const grand = totals(dataset.rows);
  const ready = prod.filter((p) => p.editStatus === "ready" || p.editStatus === "published").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h2 className="text-lg font-bold text-tg-text">خلاصه جلسه</h2>
        <span className="mr-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => downloadJson("board-meeting.json", dataset)} className="min-h-[36px]">
            دانلود JSON
          </Button>
          <Button size="sm" onClick={() => window.print()} className="min-h-[36px]">
            چاپ / PDF
          </Button>
        </span>
      </div>

      <div className="print:space-y-4">
        <Card className="space-y-2">
          <h3 className="text-base font-black text-tg-text">گزارش جامع پروژه توسعه کانال‌های یوتیوب — خلاصه جلسه</h3>
          <p className="text-xs text-tg-secondary">
            منبع داده: {dataset.source === "csv" ? "فایل CSV بارگذاری‌شده" : "داده نمایشی"} · {fmt(dataset.rows.length)} ردیف · {fmt(grand.views)} بازدید کل
          </p>
        </Card>

        <Card className="space-y-2">
          <h3 className="font-bold text-tg-text">۱. وضعیت کانال‌ها</h3>
          <ul className="space-y-1 text-sm text-tg-text">
            {perChannel.map((c) => (
              <li key={c.nameFa} className="flex flex-wrap gap-x-2">
                <strong>{c.nameFa}</strong>
                <span className="text-tg-secondary">— {fmt(c.views)} بازدید، {fmt(c.subs)} مشترک خالص، {fmt(c.count)} ویدیو</span>
                <span className="text-tg-secondary">— {c.progressNote}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-2">
          <h3 className="font-bold text-tg-text">۲. تولید و انتشار</h3>
          <p className="text-sm text-tg-text">
            {fmt(prod.length)} پروژه فعال، {fmt(ready)} مورد آماده/منتشرشده.
          </p>
        </Card>

        <Card className="space-y-2">
          <h3 className="font-bold text-tg-text">۳. توسعه آینده و همکاری‌ها</h3>
          <p className="text-sm text-tg-text">
            {fmt(ideas.length)} ایده توسعه ({fmt(ideas.filter((i) => i.priority === "اول").length)} اولویت اول) · {fmt(collabs.length)} فرصت همکاری · {fmt(licenses.filter((l) => l.licenseStatus !== "صادر شده").length)} مجوز باز.
          </p>
          {licenses.length > 0 && (
            <p className="text-sm text-tg-text">مجوزها: {licenses.map((l) => `${l.title} (${l.licenseStatus})`).join("؛ ")}</p>
          )}
        </Card>

        <Card className="space-y-2">
          <h3 className="font-bold text-tg-text">۴. تصمیم‌های جلسه</h3>
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <p key={n} className="flex gap-2 text-sm text-tg-text">
                <span className="font-black tabular-nums text-tg-accent">{n}.</span>
                <span className="min-h-6 flex-1 border-b border-dashed border-tg-border print:min-h-8" />
              </p>
            ))}
          </div>
          <p className="text-[11px] text-tg-secondary">پیشرفت مانیتایز زاویه نو: {fmtPct(Math.min(100, Math.round((perChannel[0]?.subs ?? 0) / 10)))} از مسیر ۱۰۰۰ مشترک (بر اساس داده فعلی).</p>
        </Card>
      </div>
    </div>
  );
}
