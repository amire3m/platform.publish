"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useBoardDataset } from "@/lib/board/store";
import { filterRows, programShare, topVideos, totals, viewsOverTime } from "@/lib/board/stats";
import { ChartCard } from "@/components/board/ui";
import { DemoBadge, NeedsInput, fmt, fmtPct } from "@/components/board/badges";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const FA_FONT = { fontFamily: "Vazirmatn, Tahoma, sans-serif", fontSize: 11 };

export default function ZaviyeNoPage() {
  const { dataset } = useBoardDataset();
  const [program, setProgram] = useState<string>("all");
  const rows = filterRows(dataset.rows, { channels: ["زاویه نو"] });
  const isDemo = dataset.source !== "csv";

  if (!rows.length) {
    return (
      <div className="space-y-5">
        <h2 className="text-lg font-bold text-tg-text">تحلیل ویژه زاویه نو</h2>
        <NeedsInput description="برای تحلیل این کانال، CSV شامل ردیف‌های «زاویه نو» را در داشبورد بارگذاری کنید." />
      </div>
    );
  }

  const t = totals(rows);
  const mono = { subs: t.subsGained - t.subsLost, subsPct: Math.min(100, Math.round(((t.subsGained - t.subsLost) / 1000) * 100)) };
  const share = programShare(rows);
  const farat = rows.filter((r) => r.program === "فرات");
  const notable = rows.filter((r) => r.program === "قابل توجه");
  const ft = totals(farat);
  const nt = totals(notable);
  const series = viewsOverTime(rows);
  let cum = 0;
  const cumulative = series.map((p) => { cum += p.views; return { date: p.date, views: cum }; });
  const progRows = program === "all" ? rows : rows.filter((r) => r.program === program);
  const top = topVideos(progRows, 8);
  const programs = [...new Set(rows.map((r) => r.program))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-tg-text">تحلیل ویژه زاویه نو</h2>
        {isDemo && <DemoBadge />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "پیشرفت تا ۱۰۰۰ مشترک", value: fmtPct(mono.subsPct), sub: `${fmt(mono.subs)} مشترک خالص` },
          { label: "بازدید فرات", value: fmt(ft.views), sub: `${fmt(ft.subsGained - ft.subsLost)} مشترک` },
          { label: "بازدید قابل توجه", value: fmt(nt.views), sub: `${fmt(nt.subsGained - nt.subsLost)} مشترک` },
          { label: "میانگین ماندگاری", value: t.avgDuration != null ? `${fmt(t.avgDuration)} ثانیه` : "—", sub: "میانگین زمان تماشا" },
        ].map((c) => (
          <Card key={c.label} className="text-center">
            <p className="text-lg font-black tabular-nums text-tg-text">{c.value}</p>
            <p className="mt-1 text-xs text-tg-secondary">{c.label}</p>
            <p className="text-[11px] text-tg-secondary">{c.sub}</p>
          </Card>
        ))}
      </div>

      <ChartCard title="رشد تجمیعی بازدید (قبل و بعد هر برنامه)" hint="شیب تند پس از انتشار فرات" onPng="board-zav-cum.png">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={cumulative} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--tg-border)" strokeDasharray="3 5" />
            <XAxis dataKey="date" tick={FA_FONT} tickLine={false} axisLine={false} minTickGap={30} />
            <YAxis tick={FA_FONT} tickLine={false} axisLine={false} width={52} />
            <Tooltip contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8, direction: "rtl", ...FA_FONT }} />
            <Area type="monotone" dataKey="views" name="بازدید تجمیعی" stroke="#0d9488" fill="#0d9488" fillOpacity={0.2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="فرات در برابر قابل توجه" onPng="board-zav-compare.png">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={[
                { name: "فرات", بازدید: ft.views, مشترک: ft.subsGained - ft.subsLost },
                { name: "قابل توجه", بازدید: nt.views, مشترک: nt.subsGained - nt.subsLost },
              ]}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--tg-border)" strokeDasharray="3 5" />
              <XAxis dataKey="name" tick={FA_FONT} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={FA_FONT} tickLine={false} axisLine={false} width={48} />
              <YAxis yAxisId="right" orientation="right" tick={FA_FONT} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8, direction: "rtl", ...FA_FONT }} />
              <Legend wrapperStyle={FA_FONT} />
              <Bar yAxisId="left" dataKey="بازدید" fill="#0d9488" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              <Bar yAxisId="right" dataKey="مشترک" fill="#22c55e" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Card className="space-y-3">
          <h3 className="font-bold text-tg-text">سهم هر برنامه از بازدید و جذب مشترک</h3>
          {share.map((s) => {
            const pct = t.views ? Math.round((s.views / t.views) * 100) : 0;
            return (
              <div key={s.name}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-tg-text">{s.name}</span>
                  <span className="tabular-nums text-tg-secondary">{fmt(s.views)} · {fmt(s.subs)} مشترک · {fmtPct(pct)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-tg-hover">
                  <div className="h-full rounded-full bg-tg-accent" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-tg-text">بهترین ویدیوها</h3>
          <select value={program} onChange={(e) => setProgram(e.target.value)} className="min-h-[36px] rounded-lg border border-tg-border bg-tg-surface px-2 text-xs text-tg-text" aria-label="برنامه">
            <option value="all">همه برنامه‌ها</option>
            {programs.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <ol className="space-y-2">
          {top.map((v, i) => (
            <li key={`${v.title}-${i}`} className="flex items-center gap-2 rounded-lg bg-tg-hover/40 px-3 py-2 text-xs">
              <span className="font-black tabular-nums text-tg-accent">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-tg-text" title={v.title}>{v.title}</span>
              <span className="shrink-0 tabular-nums text-tg-secondary">{fmt(v.views)} بازدید</span>
            </li>
          ))}
          {top.length === 0 && <NeedsInput title="نیازمند تکمیل اطلاعات" description="ویدیویی در این بازه نیست." />}
        </ol>
      </Card>

      <Card className="space-y-2">
        <h3 className="font-bold text-tg-text">تحلیل برند و پیشنهاد نیچ</h3>
        <ul className="space-y-1 text-xs leading-5 text-tg-text">
          <li>• اثر «فرات» بر رشد، چند برابر «قابل توجه» است — ستون فقرات برند همین برنامه است.</li>
          <li>• نیچ پیشنهادی: گفت‌وگو + مسائل اجتماعی + موضوعات روز (تأیید نهایی با داده بیشتر).</li>
          <li>• پیشنهاد: سری‌سازی گفت‌وگوهای اجتماعی با ریتم ثابت هفتگی + برش‌های کوتاه برای رشد مشترک.</li>
        </ul>
        {isDemo && <p className="text-[11px] text-tg-secondary">بر اساس داده نمایشی؛ با CSV واقعی بازنویسی می‌شود.</p>}
      </Card>
    </div>
  );
}
