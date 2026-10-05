"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui";
import type { StrategyChartCompare, StrategyChartDemand, StrategyChartTrend } from "@/lib/strategy/types";

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function fa(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

function fmtK(v: number): string {
  if (v >= 1000) return `${fa((v / 1000).toFixed(2).replace(/\.?0+$/, ""))} میلیون`;
  if (v < 1) return `${fa(v.toFixed(1))} هزار`;
  return `${fa(Math.round(v))} هزار`;
}

// --- میله‌ای تقاضا (هزار بازدید) ---
export function DemandChart({ data, source }: { data: StrategyChartDemand[]; source?: string }) {
  const rows = data.map((d) => ({ name: d.label, v: d.value, hl: !!d.highlight }));
  return (
    <Card className="space-y-2">
      <p className="text-xs font-bold text-tg-text">تقاضا در یک نگاه (میانه ۵ ویدیوی برتر، هزار بازدید)</p>
      <div dir="ltr" style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(v: number) => fa(v)} fontSize={10} />
            <YAxis type="category" dataKey="name" width={170} fontSize={11} tick={{ fill: "currentColor" }} />
            <Tooltip formatter={(v) => [fmtK(Number(v)), "بازدید"]} />
            <Bar dataKey="v" radius={[3, 3, 3, 3]}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.hl ? "#b8913a" : "#0e4d4a"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {source && <p className="text-[10px] text-tg-secondary">منبع: {source}</p>}
    </Card>
  );
}

// --- خطی روند ماهانه ---
export function TrendChart({ trend }: { trend: StrategyChartTrend }) {
  const rows = trend.months.map((m, i) => {
    const r: Record<string, number | string | null> = { month: m };
    for (const line of trend.lines) r[line.name] = line.values[i] ?? null;
    return r;
  });
  return (
    <Card className="space-y-2">
      <p className="text-xs font-bold text-tg-text">روند علاقه ماهانه (بازدید ویکی‌پدیا)</p>
      <div dir="ltr" style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" fontSize={9} interval={5} tick={{ fill: "currentColor" }} />
            <YAxis fontSize={10} tickFormatter={(v: number) => (v >= 1000 ? fa(`${Math.round(v / 1000)} هزار`) : fa(v))} tick={{ fill: "currentColor" }} />
            <Tooltip formatter={(v) => [v == null ? "—" : fa(Number(v).toLocaleString("en-US")), "بازدید"]} />
            <Legend />
            {trend.lines.map((l) => (
              <Line key={l.name} type="monotone" dataKey={l.name} stroke={l.color} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-tg-secondary">منبع: {trend.source}</p>
    </Card>
  );
}

// --- مقایسه‌ای: ۱۲ ماه اخیر vs مرجع همه‌زمان ---
export function CompareChart({ data, source }: { data: StrategyChartCompare[]; source?: string }) {
  const rows = data.map((d) => ({ name: d.label, recent: d.recent, allTime: d.allTime }));
  return (
    <Card className="space-y-2">
      <p className="text-xs font-bold text-tg-text">بهترین ۱۲ ماه اخیر در برابر مرجع همه‌زمان (هزار بازدید)</p>
      <div dir="ltr" style={{ width: "100%", height: Math.max(260, rows.length * 34) }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" fontSize={10} tickFormatter={(v: number) => fa(v)} />
            <YAxis type="category" dataKey="name" width={190} fontSize={11} tick={{ fill: "currentColor" }} />
            <Tooltip formatter={(v, name) => [v == null ? "—" : fmtK(Number(v)), name === "recent" ? "۱۲ ماه اخیر" : "همه‌زمان"]} />
            <Legend formatter={(v) => (v === "recent" ? "۱۲ ماه اخیر" : "مرجع همه‌زمان")} />
            <Bar dataKey="recent" fill="#0e4d4a" radius={[3, 3, 3, 3]} />
            <Bar dataKey="allTime" fill="#b8913a" radius={[3, 3, 3, 3]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {source && <p className="text-[10px] text-tg-secondary">منبع: {source}</p>}
    </Card>
  );
}
