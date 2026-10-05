"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Clapperboard, Flag, ListVideo, Map, Rocket, Star, Tags } from "lucide-react";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { CHANNEL_FA, getStrategyTopic, stars } from "@/lib/strategy";
import type { StrategyTopic } from "@/lib/strategy/types";

async function fetcher(url: string) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا");
  return body.data as StrategyTopic;
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-tg-text">
        <Icon className="h-4 w-4 text-tg-accent" />
        {title}
      </h2>
      {children}
    </Card>
  );
}

function ExplainBox({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-xs leading-6 text-tg-text/90">
      {text}
    </div>
  );
}

function MiniTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-tg-border">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="bg-tg-hover/50 text-right text-tg-secondary">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-tg-border">
          {rows.map((r, i) => (
            <tr key={i} className="text-tg-text">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top leading-relaxed">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StrategyTopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // Static registry first (instant), API fallback for future DB-backed topics.
  const local = getStrategyTopic(id);
  const { data: remote, isLoading } = useSWR<StrategyTopic | null>(
    local ? null : `/api/strategy/${id}`,
    fetcher,
  );
  const t = local ?? remote;

  if (!local && isLoading) {
    return (
      <div className="space-y-4" dir="rtl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!t) {
    return (
      <div className="space-y-6" dir="rtl">
        <Link href="/strategy" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
          <ArrowRight className="h-4 w-4" />
          بازگشت به استراتژی محتوا
        </Link>
        <EmptyState title="پرونده یافت نشد" />
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <Link href="/strategy" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
        <ArrowRight className="h-4 w-4" />
        بازگشت به استراتژی محتوا
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tg-text">پرونده {t.title} <span className="text-xs font-medium text-tg-secondary">نسخه {t.version} · {t.status}</span></h1>
        <p className="mt-1 text-sm text-tg-secondary">مخاطب: {t.audience} · هدف: {t.goal}</p>
        {t.redlinesOpen && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Flag className="h-3.5 w-3.5" />
            {t.redlines.length} خط قرمز باز — {t.ideas.filter((i) => i.flag?.includes("خط قرمز")).length} ایده قفل است
          </p>
        )}
      </div>

      {t.houseFormat && (
        <Section icon={Star} title={`فرم خانه: ${t.houseFormat.name}`}>
          <p className="text-xs leading-relaxed text-tg-secondary">{t.houseFormat.desc}</p>
          <ol className="list-decimal space-y-1 pr-5 text-xs text-tg-text">
            {t.houseFormat.structure.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Section>
      )}

      {t.readingGuide && <ExplainBox text={t.readingGuide} />}

      <Section icon={Map} title="نقشه رقبا و خلأها">
        <MiniTable
          head={["رقیب", "فرم", "مقیاس", "خلأ قابل حمله"]}
          rows={t.competitors.map((c) => [c.name, c.form, c.scale, c.gap])}
        />
        {t.strategyNote && <p className="text-xs leading-relaxed text-tg-secondary">{t.strategyNote}</p>}
      </Section>

      <Section icon={ListVideo} title={`سری‌های پلی‌لیست (${t.series.length})`}>
        <MiniTable
          head={["سری", "رقابت", "پتانسیل", "گفتمان", "کانال‌ها", "یادداشت"]}
          rows={t.series.map((s) => [
            s.name,
            stars(s.competition),
            stars(s.potential),
            stars(s.discourse),
            s.channels.map((c) => CHANNEL_FA[c] ?? c).join("، "),
            s.note ?? "—",
          ])}
        />
        <div className="space-y-2">
          <p className="text-xs font-bold text-tg-text">چرای هر سری:</p>
          {t.series.filter((s) => s.why).map((s) => (
            <p key={s.name} className="text-xs leading-6 text-tg-text/90">
              <b className="text-tg-accent">{s.name}: </b>
              {s.why}
            </p>
          ))}
        </div>
      </Section>

      <Section icon={Tags} title={`بانک ایده‌ها (${t.ideas.length}) — ★ یعنی کمتر/بهتر در رقابت`}>
        <MiniTable
          head={["#", "عنوان", ...(t.ideas.some((i) => i.wave) ? ["موج"] : []), "رقابت", "پتانسیل", "گفتمان", "کانال", "پرچم"]}
          rows={t.ideas.map((i) => [
            String(i.n),
            `${i.t}${i.kind ? ` (${i.kind})` : ""}`,
            ...(t.ideas.some((x) => x.wave) ? [i.wave ? `موج ${i.wave}` : "—"] : []),
            stars(i.comp),
            stars(i.pot),
            stars(i.disc),
            i.ch.map((c) => CHANNEL_FA[c] ?? c).join("، "),
            i.flag ?? "—",
          ])}
        />
        {t.shortsPolicy && <ExplainBox text={`قاعده شورتس: ${t.shortsPolicy}`} />}
      </Section>

      <Section icon={Rocket} title="۱۰ عنوان شروع">
        <ol className="space-y-2">
          {t.topStart.map((s, idx) => (
            <li key={s.t} className="flex gap-2 text-xs leading-relaxed">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tg-accent text-[10px] font-bold text-white">{idx + 1}</span>
              <span className="text-tg-text"><b>{s.t}</b> <span className="text-tg-secondary">— {s.why}</span></span>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={Clapperboard} title={`کتابخانه فرم تولید (${t.formats.length})`}>
        <MiniTable
          head={["فرم", "کانال", "هزینه", "نقش", "یادداشت"]}
          rows={t.formats.map((f) => [f.name, f.channels.map((c) => CHANNEL_FA[c] ?? c).join("، "), f.cost, f.role, f.note ?? "—"])}
        />
        {t.hooks.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-bold text-tg-text">موتور هوک (فرمول عنوان):</p>
            <div className="flex flex-wrap gap-1.5">
              {t.hooks.map((h) => (
                <span key={h} className="rounded-full bg-tg-hover px-2.5 py-1 text-[11px] text-tg-text">{h}</span>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section icon={Map} title="نقشه کلب (انتشار دوقلو)">
        {t.collabLogic && <ExplainBox text={t.collabLogic} />}
        <MiniTable head={["هفته", "ستون ایران (فارسی)", "ستون جهان (+نسخه عربی/انگلیسی)"]} rows={t.collabs.map((c) => [c.weeks, c.colIran, c.colWorld])} />
      </Section>

      <Section icon={Star} title="KPI پیشنهادی">
        <MiniTable head={["سری", "بازدید", "نگه‌داشت", "CTR", "نکته"]} rows={t.kpis.map((k) => [k.series, k.views, k.retention, k.ctr, k.note])} />
      </Section>

      <Section icon={Flag} title="پرچم اسپین‌آف + خط قرمزها">
        <ul className="space-y-1.5 text-xs leading-relaxed">
          {t.spinoffs.map((s) => (
            <li key={s.name} className="text-tg-text"><b>{s.name}:</b> <span className="text-tg-secondary">{s.verdict}</span></li>
          ))}
        </ul>
        {t.redlineNote && <ExplainBox text={t.redlineNote} />}
        {t.redlines.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
            <p className="mb-1 text-xs font-bold text-amber-700 dark:text-amber-300">خط قرمزها {t.redlinesOpen ? "(باز — تعیین تکلیف نشده)" : "(تعیین تکلیف شده)"}:</p>
            <div className="flex flex-wrap gap-1.5">
              {t.redlines.map((r) => (
                <span key={r} className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-700 dark:text-amber-300">{r}</span>
              ))}
            </div>
          </div>
        )}
      </Section>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => window.print()}>چاپ / ذخیره PDF</Button>
      </div>
    </div>
  );
}
