"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, EmptyState, Skeleton } from "@/components/ui";

interface GeoDatum {
  country: string;
  views: number;
}

interface GeoChartProps {
  data?: readonly GeoDatum[] | null;
  isLoading?: boolean;
  error?: string | null;
}

const EMPTY_MESSAGE = "هنوز دیتایی برای این بخش sync نشده — تب را باز نگه دارید و همگام‌سازی بزنید";

const PLACEHOLDER_DATA: GeoDatum[] = [
  { country: "IR", views: 4200 },
  { country: "US", views: 1800 },
  { country: "DE", views: 900 },
  { country: "TR", views: 750 },
  { country: "GB", views: 600 },
];

export function GeoChart({ data, isLoading, error }: GeoChartProps) {
  if (isLoading) return <Skeleton className="h-72" />;
  if (error) {
    return <Card><p className="text-sm text-rose-600 dark:text-rose-400">{error}</p></Card>;
  }
  const hasData = data && data.length > 0;
  const chartData = hasData ? [...data].slice(0, 10) : PLACEHOLDER_DATA;

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-bold text-tg-text">توزیع جغرافیایی</h3>
        <p className="mt-1 text-xs text-tg-secondary">نمایش بازدید بر اساس کشور (Top 10) — نمودار میله‌ای</p>
      </div>
      {!hasData && (
        <div className="rounded-lg border border-dashed border-tg-border bg-tg-hover/50 px-4 py-3 text-center text-xs leading-5 text-tg-secondary">
          {EMPTY_MESSAGE}
          <span className="mt-1 block text-[11px] opacity-70">پیش‌نمایش با داده نمونه — پس از همگام‌سازی داده واقعی جایگزین می‌شود</span>
        </div>
      )}
      <div className="h-72 min-w-0" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--tg-border)" strokeDasharray="3 5" />
            <XAxis dataKey="country" stroke="var(--tg-secondary)" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis stroke="var(--tg-secondary)" tickLine={false} axisLine={false} width={48} fontSize={11} />
            <Tooltip
              contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8, color: "var(--tg-text)", direction: "rtl" }}
              labelStyle={{ color: "var(--tg-secondary)" }}
            />
            <Bar dataKey="views" name="بازدید" fill="var(--tg-accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} opacity={hasData ? 1 : 0.55} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!hasData && <EmptyState title="نمونه جغرافیا" description="پس از sync، تفکیک کشوری اینجا پر می‌شود." />}
    </Card>
  );
}
