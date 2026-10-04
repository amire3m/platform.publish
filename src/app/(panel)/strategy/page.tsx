"use client";

import Link from "next/link";
import { ArrowLeft, Compass, Flag } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { strategyTopics } from "@/lib/strategy";

const STATUS_STYLE: Record<string, string> = {
  "پیش‌نویس": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "بسته": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "در حال انتشار": "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

export default function StrategyPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-tg-text">
          <Compass className="h-5 w-5 text-tg-accent" />
          استراتژی محتوا
        </h1>
        <p className="mt-1 text-sm text-tg-secondary">
          پرونده‌های موضوعی یوتیوب موسسه: نیچ‌ها، سری‌ها، ایده‌ها، سیر انتشار و پرچم اسپین‌آف — زنده و قابل بازبینی، نه PDF ثابت.
        </p>
      </div>

      {strategyTopics.length === 0 && <EmptyState title="پرونده‌ای ثبت نشده است" />}

      <div className="grid gap-4 md:grid-cols-2">
        {strategyTopics.map((t) => (
          <Link key={t.id} href={`/strategy/${t.id}`}>
            <Card className="space-y-3 transition hover:border-tg-accent">
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-bold text-tg-text">{t.title}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[t.status] ?? "bg-tg-hover text-tg-secondary"}`}>
                  {t.status} · {t.version}
                </span>
              </div>
              <p className="text-xs text-tg-secondary">مخاطب: {t.audience} · هدف: {t.goal}</p>
              <div className="flex flex-wrap gap-3 text-xs text-tg-secondary">
                <span>{t.series.length} سری</span>
                <span>{t.ideas.length} ایده</span>
                <span>{t.formats.length} فرم تولید</span>
                {t.redlinesOpen && (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                    <Flag className="h-3.5 w-3.5" />
                    {t.redlines.length} خط قرمز باز
                  </span>
                )}
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-tg-accent">
                مشاهده پرونده
                <ArrowLeft className="h-3.5 w-3.5" />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
