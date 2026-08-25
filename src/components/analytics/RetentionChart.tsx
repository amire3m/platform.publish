"use client";

import { Bar, BarChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { formatAnalyticsNumber } from "@/lib/analytics/presentation";

interface RetentionDatum {
  videoId: string;
  title?: string;
  averageViewPercentage: number | null;
  views?: number;
}

interface RetentionChartProps {
  data?: readonly RetentionDatum[] | null;
  isLoading?: boolean;
  error?: string | null;
}

const EMPTY_MESSAGE = "هنوز دیتایی برای این بخش sync نشده — تب را باز نگه دارید و همگام‌سازی بزنید";

const PLACEHOLDER: RetentionDatum[] = [
  { videoId: "vid_1", title: "ویدیو ۱ — معرفی", averageViewPercentage: 58, views: 4200 },
  { videoId: "vid_2", title: "ویدیو ۲ — گفتگو", averageViewPercentage: 42, views: 3100 },
  { videoId: "vid_3", title: "ویدیو ۳ — مستند", averageViewPercentage: 71, views: 1800 },
  { videoId: "vid_4", title: "ویدیو ۴ — ویژه", averageViewPercentage: 35, views: 900 },
];

export function RetentionChart({ data, isLoading, error }: RetentionChartProps) {
  if (isLoading) return <Skeleton className="h-72" />;
  if (error) return <Card><p className="text-sm text-rose-600 dark:text-rose-400">{error}</p></Card>;
  const hasData = data && data.length > 0;
  const rows = (hasData ? data : PLACEHOLDER) as RetentionDatum[];
  const chartData = rows.map((r) => ({
    label: r.title ? r.title.slice(0, 18) : r.videoId.slice(0, 8),
    retention: r.averageViewPercentage ?? 0,
    views: r.views ?? 0,
  }));

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-bold text-tg-text">ماندگاری مخاطب</h3>
        <p className="mt-1 text-xs text-tg-secondary">میانگین درصد دیده‌شده به‌ازای هر ویدیو (averageViewPercentage) + خط روند نسبی</p>
      </div>
      {!hasData && (
        <div className="rounded-lg border border-dashed border-tg-border bg-tg-hover/50 px-4 py-3 text-center text-xs leading-5 text-tg-secondary">
          {EMPTY_MESSAGE}
          <span className="mt-1 block text-[11px] opacity-70">پیش‌نمایش با داده نمونه</span>
        </div>
      )}
      <div className="h-72 min-w-0" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 12 }}>
            <CartesianGrid vertical={false} stroke="var(--tg-border)" strokeDasharray="3 5" />
            <XAxis dataKey="label" stroke="var(--tg-secondary)" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-12} dy={8} />
            <YAxis yAxisId="left" stroke="var(--tg-secondary)" tickLine={false} axisLine={false} width={40} fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${formatAnalyticsNumber(Number(v))}٪`} />
            <YAxis yAxisId="right" orientation="right" stroke="var(--tg-secondary)" tickLine={false} axisLine={false} width={48} fontSize={11} tickFormatter={(v) => formatAnalyticsNumber(Number(v), "compact")} />
            <Tooltip contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8, direction: "rtl" }} formatter={(value, name) => [name === "retention" ? `${formatAnalyticsNumber(Number(value))}٪` : formatAnalyticsNumber(Number(value)), name === "retention" ? "ماندگاری" : "بازدید"] as never} />
            <Bar yAxisId="left" dataKey="retention" name="retention" fill="var(--tg-accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} opacity={hasData ? 1 : 0.55} />
            <Line yAxisId="right" type="monotone" dataKey="views" name="views" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} opacity={hasData ? 0.9 : 0.45} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!hasData && <EmptyState title="نمونه ماندگاری" description="پس از sync، ماندگاری هر ویدیو اینجا ترسیم می‌شود. در صورت موجود بودن elapsedVideoTimeRatio، منحنی دقیق‌تر اضافه خواهد شد." />}
    </Card>
  );
}
