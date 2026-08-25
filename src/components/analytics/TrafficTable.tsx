"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { formatAnalyticsNumber, formatWatchMinutes } from "@/lib/analytics/presentation";

interface TrafficRow {
  trafficSource: string;
  views: number;
  watchTimeMinutes: number;
}

interface TrafficTableProps {
  data?: readonly TrafficRow[] | null;
  isLoading?: boolean;
  error?: string | null;
}

const EMPTY_MESSAGE = "هنوز دیتایی برای این بخش sync نشده — تب را باز نگه دارید و همگام‌سازی بزنید";

const PLACEHOLDER: TrafficRow[] = [
  { trafficSource: "YT_SEARCH", views: 5400, watchTimeMinutes: 8200 },
  { trafficSource: "EXT_URL", views: 3100, watchTimeMinutes: 4200 },
  { trafficSource: "RELATED_VIDEO", views: 2600, watchTimeMinutes: 3900 },
  { trafficSource: "BROWSE", views: 1800, watchTimeMinutes: 2500 },
];

const COLORS = ["var(--tg-accent)", "#22c55e", "#f59e0b", "#06b6d4", "#a78bfa", "#ef4444"];

export function TrafficTable({ data, isLoading, error }: TrafficTableProps) {
  if (isLoading) return <Skeleton className="h-72" />;
  if (error) return <Card><p className="text-sm text-rose-600 dark:text-rose-400">{error}</p></Card>;
  const hasData = data && data.length > 0;
  const rows = hasData ? data : PLACEHOLDER;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-tg-border px-4 py-4 sm:px-5">
          <h3 className="font-bold text-tg-text">منابع ترافیک</h3>
          <p className="mt-1 text-xs text-tg-secondary">insightTrafficSourceType — بازدید و زمان تماشا</p>
        </div>
        {!hasData && (
          <div className="mx-4 mt-4 rounded-lg border border-dashed border-tg-border bg-tg-hover/50 px-4 py-3 text-center text-xs leading-5 text-tg-secondary">
            {EMPTY_MESSAGE}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-tg-hover/40 text-xs text-tg-secondary">
              <tr>
                <th className="px-4 py-2 text-start font-semibold">منبع</th>
                <th className="px-4 py-2 text-start font-semibold">بازدید</th>
                <th className="px-4 py-2 text-start font-semibold">زمان تماشا</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tg-border">
              {(rows as TrafficRow[]).map((row) => (
                <tr key={row.trafficSource} className={hasData ? "" : "opacity-60"}>
                  <td className="px-4 py-3 font-medium text-tg-text">{row.trafficSource}</td>
                  <td className="px-4 py-3 text-tg-text">{formatAnalyticsNumber(row.views)}</td>
                  <td className="px-4 py-3 text-tg-text">{formatWatchMinutes(row.watchTimeMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!hasData && <div className="px-5 pb-4"><EmptyState title="نمونه ترافیک" description="پس از sync، جدول منابع واقعی پر می‌شود." /></div>}
      </Card>

      <Card className="space-y-4">
        <h3 className="font-bold text-tg-text">سهم ترافیک (دونات)</h3>
        <div className="h-64 min-w-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows as unknown as Record<string, unknown>[]} dataKey="views" nameKey="trafficSource" cx="50%" cy="50%" innerRadius={48} outerRadius={88} isAnimationActive={false} opacity={hasData ? 1 : 0.6}>
                {(rows as TrafficRow[]).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
