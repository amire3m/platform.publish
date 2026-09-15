"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card } from "@/components/ui";
import { BOARD_CHANNELS, DEMO_PROGRAMS } from "@/lib/board/channels";
import { useBoardDataset, printReport } from "@/lib/board/store";
import { filterRows, monetizationProgress, programShare, topVideos, totals, viewsOverTime } from "@/lib/board/stats";
import type { CsvRow } from "@/lib/board/types";
import { ChartCard, DataTable, Field, BoardSelect } from "@/components/board/ui";
import { CsvUploader } from "@/components/board/CsvUploader";
import { DemoBadge, MissingBadge, fmt, fmtPct } from "@/components/board/badges";

const FA_FONT = { fontFamily: "Vazirmatn, Tahoma, sans-serif", fontSize: 11 };

export default function BoardDashboardPage() {
  const { dataset, replace, resetDemo } = useBoardDataset();
  const [channels, setChannels] = useState<string[]>([]);
  const [program, setProgram] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const rows = useMemo(
    () => filterRows(dataset.rows, {
      channels: channels.length ? channels : undefined,
      program: program || undefined,
      query: query.trim() || undefined,
      range: from || to ? { from, to } : null,
    }),
    [dataset.rows, channels, program, query, from, to],
  );
  const t = useMemo(() => totals(rows), [rows]);
  const series = useMemo(() => viewsOverTime(rows), [rows]);
  const share = useMemo(() => programShare(rows), [rows]);
  const top = useMemo(() => topVideos(rows, 10), [rows]);
  const mono = useMemo(() => monetizationProgress(rows), [rows]);
  const programs = useMemo(() => [...new Set(dataset.rows.map((r) => r.program))].sort(), [dataset.rows]);
  const isDemo = dataset.source !== "csv";

  function toggleChannel(name: string) {
    setChannels((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-tg-text">داشبورد آماری یوتیوب</h2>
        {isDemo && <DemoBadge />}
        <span className="mr-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowUpload((v) => !v)} className="min-h-[36px]">
            بارگذاری CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={printReport} className="min-h-[36px]">
            چاپ / PDF
          </Button>
          {dataset.source !== "demo" && (
            <Button variant="ghost" size="sm" onClick={resetDemo} className="min-h-[36px]">
              بازگشت به نمایشی
            </Button>
          )}
        </span>
      </div>

      {showUpload && (
        <CsvUploader
          onConfirm={(newRows: CsvRow[], fileName: string) => {
            replace(newRows, fileName);
            setShowUpload(false);
          }}
        />
      )}
      {dataset.fileName && <p className="text-xs text-tg-secondary">فایل فعال: {dataset.fileName}</p>}

      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <p className="mb-1 text-xs font-semibold text-tg-secondary">کانال‌ها</p>
          <div className="flex flex-wrap gap-1.5">
            {BOARD_CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleChannel(c.nameFa)}
                aria-pressed={channels.includes(c.nameFa)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  channels.includes(c.nameFa) ? "text-white" : "bg-tg-hover text-tg-text"
                }`}
                style={channels.includes(c.nameFa) ? { backgroundColor: c.color } : undefined}
              >
                {c.nameFa}
              </button>
            ))}
          </div>
        </div>
        <Field label="برنامه">
          <BoardSelect value={program} onChange={setProgram} ariaLabel="برنامه" options={[{ value: "", label: "همه برنامه‌ها" }, ...DEMO_PROGRAMS.map((p) => ({ value: p, label: p })), ...programs.filter((p) => !DEMO_PROGRAMS.includes(p)).map((p) => ({ value: p, label: p }))]} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="از تاریخ">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-[40px] rounded-lg border border-tg-border bg-tg-surface px-2 text-sm text-tg-text" />
          </Field>
          <Field label="تا تاریخ">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-[40px] rounded-lg border border-tg-border bg-tg-surface px-2 text-sm text-tg-text" />
          </Field>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "بازدید", value: fmt(t.views) },
          { label: "مشترک جدید (خالص)", value: fmt(t.subsGained - t.subsLost) },
          { label: "زمان تماشا (ساعت)", value: fmt(Math.round(t.watchMinutes / 60)) },
          { label: "نرخ تعامل", value: fmtPct(t.engagement) },
          { label: "میانگین بازدید ویدیو", value: fmt(t.avgViews) },
          { label: "میانگین زمان تماشا (ثانیه)", value: fmt(t.avgDuration) },
          { label: "میانگین CTR", value: fmtPct(t.ctr) },
          { label: "ویدیوها", value: fmt(t.videos) },
        ].map((c) => (
          <Card key={c.label} className="text-center">
            <p className="text-lg font-black tabular-nums text-tg-text">{c.value}</p>
            <p className="mt-1 text-xs text-tg-secondary">{c.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="روند بازدید و مشترک" hint="روزانه" onPng="board-views.png">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--tg-border)" strokeDasharray="3 5" />
              <XAxis dataKey="date" tick={FA_FONT} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis tick={FA_FONT} tickLine={false} axisLine={false} width={48} />
              <Tooltip contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8, direction: "rtl", ...FA_FONT }} />
              <Legend wrapperStyle={FA_FONT} />
              <Area type="monotone" dataKey="views" name="بازدید" stroke="var(--tg-accent)" fill="var(--tg-accent)" fillOpacity={0.2} isAnimationActive={false} />
              <Area type="monotone" dataKey="subs" name="مشترک خالص" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="سهم برنامه‌ها از بازدید" onPng="board-share.png">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={share} dataKey="views" nameKey="name" cx="50%" cy="50%" outerRadius={88} isAnimationActive={false} label={{ ...FA_FONT }}>
                {share.map((_, i) => (
                  <Cell key={i} fill={["var(--tg-accent)", "#38bdf8", "#f59e0b", "#a78bfa", "#22c55e", "#f472b6"][i % 6]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8, ...FA_FONT }} />
              <Legend wrapperStyle={FA_FONT} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="مقایسه بازدید و مشترک جدید" onPng="board-compare.png">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={share.slice(0, 8)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--tg-border)" strokeDasharray="3 5" />
            <XAxis dataKey="name" tick={FA_FONT} tickLine={false} axisLine={false} interval={0} angle={-15} dy={10} height={60} />
            <YAxis yAxisId="left" tick={FA_FONT} tickLine={false} axisLine={false} width={48} />
            <YAxis yAxisId="right" orientation="right" tick={FA_FONT} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8, direction: "rtl", ...FA_FONT }} />
            <Legend wrapperStyle={FA_FONT} />
            <Bar yAxisId="left" dataKey="views" name="بازدید" fill="var(--tg-accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            <Bar yAxisId="right" dataKey="subs" name="مشترک" fill="#22c55e" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card className="space-y-3">
        <h3 className="font-bold text-tg-text">پیشرفت تا مانیتایز (۱۰۰۰ مشترک + ۴۰۰۰ ساعت)</h3>
        {[
          { label: "مشترک", pct: mono.subsPct, value: fmt(mono.subs) },
          { label: "ساعت تماشا", pct: mono.hoursPct, value: fmt(mono.watchHours) },
        ].map((m) => (
          <div key={m.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-tg-secondary">{m.label}</span>
              <span className="font-medium tabular-nums text-tg-text">{m.value} · {fmtPct(m.pct)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-tg-hover">
              <div className="h-full rounded-full bg-tg-accent" style={{ width: `${m.pct}%` }} />
            </div>
          </div>
        ))}
        {isDemo && <p className="text-[11px] text-tg-secondary">بر اساس داده نمایشی؛ با CSV واقعی جایگزین می‌شود.</p>}
      </Card>

      <Card className="space-y-3">
        <h3 className="font-bold text-tg-text">ویدیوهای برتر</h3>
        <DataTable
          rows={top.map((v, i) => ({ ...v, id: `${v.channel}-${v.title}-${i}` }))}
          columns={[
            { key: "title", label: "ویدیو", render: (r) => <span title={r.title}>{r.title.length > 40 ? `${r.title.slice(0, 40)}…` : r.title}</span>, sortValue: (r) => r.title },
            { key: "program", label: "برنامه", render: (r) => r.program },
            { key: "views", label: "بازدید", render: (r) => <span className="tabular-nums">{fmt(r.views)}</span>, sortValue: (r) => r.views },
            { key: "subs", label: "مشترک", render: (r) => <span className="tabular-nums">{fmt(r.subs)}</span>, sortValue: (r) => r.subs },
            { key: "eng", label: "تعامل٪", render: (r) => <span className="tabular-nums">{fmtPct(r.engagement)}</span> },
          ]}
          searchKeys={[(r) => `${r.title} ${r.program}`]}
        />
      </Card>

      <div className="flex items-center gap-2 text-xs text-tg-secondary">
        {isDemo ? <><DemoBadge /><span>نمودارها با داده نمایشی رسم شده‌اند.</span></> : <MissingBadge label="داده واقعی CSV فعال است" />}
      </div>
    </div>
  );
}
