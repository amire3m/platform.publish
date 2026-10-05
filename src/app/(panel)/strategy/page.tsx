"use client";

import Link from "next/link";
import { ArrowLeft, Compass, Flag } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { getTopicChildren, strategyTopics } from "@/lib/strategy";

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

      <Card className="space-y-2 border-sky-500/25 bg-sky-500/5">
        <h2 className="text-sm font-bold text-tg-text">روش‌شناسی (ثابت همه پرونده‌ها)</h2>
        <ul className="list-disc space-y-1 pr-5 text-xs leading-6 text-tg-text/90">
          <li>مبنا تحقیق بازار است (داده + منابع باز)؛ هر عدد منبع و تاریخ دارد و عدد تأییدنشده «نیازمند تأیید» می‌خورد.</li>
          <li>امتیازها ۱ تا ۵: در «رقابت» کمتر یعنی بکرتر؛ وزن ریسک پلتفرم عمداً بالاست.</li>
          <li>تولید واقعی: بدون تصویر/صدای ساخته هوش مصنوعی؛ آرشیو واقعی، راوی انسان، بازسازی با برچسب.</li>
          <li>شورتس محتوای جدا نیست؛ مکمل ویدیوی کامل است (هر بلند ۲ تا ۳ شورتس، معیار: تبدیل به تماشای کامل).</li>
          <li>موج‌بندی: ۱ شروع فوری · ۲ بعدی و ارزان · ۳ متوقف تا روشن‌شدن ریسک.</li>
        </ul>
      </Card>

      {strategyTopics.length === 0 && <EmptyState title="پرونده‌ای ثبت نشده است" />}

      <div className="grid gap-4 md:grid-cols-2">
        {strategyTopics.map((t) => {
          const children = getTopicChildren(t.id);
          return (
          <Card key={t.id} className="space-y-3">
            <Link href={`/strategy/${t.id}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-bold text-tg-text transition hover:text-tg-accent">{t.title}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[t.status] ?? "bg-tg-hover text-tg-secondary"}`}>
                  {t.status} · {t.version}
                </span>
              </div>
            </Link>
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
            {children.length > 0 && (
              <div className="space-y-1.5 border-t border-tg-border pt-2.5">
                {children.map((c) => (
                  <Link key={c.id} href={`/strategy/${c.id}`} className="flex items-center justify-between rounded-lg bg-tg-hover/40 px-3 py-2 transition hover:bg-tg-hover">
                    <span className="text-xs font-medium text-tg-text">{c.title}</span>
                    <span className="flex items-center gap-2 text-[11px] text-tg-secondary">
                      {c.ideas.length} ایده
                      <ArrowLeft className="h-3 w-3 text-tg-accent" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <Link href={`/strategy/${t.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-tg-accent">
              مشاهده پرونده
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
