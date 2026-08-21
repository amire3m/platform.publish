"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAnalyticsDate, formatAnalyticsNumber, formatWatchMinutes } from "@/lib/analytics/presentation";
import type { AnalyticsChartPoint } from "@/lib/analytics/types";

type TrendMetric = "views" | "watchTimeMinutes" | "engagementRate";

const metricConfig: Record<TrendMetric, { label: string; format: (value: number) => string }> = {
  views: { label: "بازدید", format: (value) => formatAnalyticsNumber(value) },
  watchTimeMinutes: { label: "زمان تماشا", format: formatWatchMinutes },
  engagementRate: { label: "نرخ تعامل", format: (value) => `${formatAnalyticsNumber(value)}٪` },
};

function chartData(series: readonly AnalyticsChartPoint[]) {
  return series.map((point) => ({ ...point, dateLabel: formatAnalyticsDate(point.date) }));
}

function chartSummary(series: readonly AnalyticsChartPoint[], metric: TrendMetric): string {
  if (series.length === 0) return "داده‌ای برای نمایش در نمودار موجود نیست.";
  const values = series.map((point) => point[metric]);
  const latest = values[values.length - 1];
  const peak = Math.max(...values);
  return `آخرین مقدار ${metricConfig[metric].label} ${metricConfig[metric].format(latest)} و بیشترین مقدار ${metricConfig[metric].format(peak)} است.`;
}

export function AnalyticsTrendChart({ series, title = "روند عملکرد" }: {
  series: readonly AnalyticsChartPoint[];
  title?: string;
}) {
  const [metric, setMetric] = useState<TrendMetric>("views");
  const config = metricConfig[metric];
  const data = chartData(series);

  return (
    <section className="min-w-0 rounded-xl border border-tg-border bg-tg-surface p-4 sm:p-5" aria-labelledby="analytics-trend-title">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="analytics-trend-title" className="font-bold text-tg-text">{title}</h2>
          <p className="mt-1 text-xs text-tg-secondary" aria-live="polite">{chartSummary(series, metric)}</p>
        </div>
        <div className="grid grid-cols-3 rounded-lg bg-tg-hover p-1" role="group" aria-label="شاخص نمودار">
          {(Object.keys(metricConfig) as TrendMetric[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              aria-pressed={metric === key}
              className={`min-h-11 rounded-md px-2 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0 sm:px-3 ${
                metric === key ? "bg-tg-surface text-tg-accent shadow-sm" : "text-tg-secondary hover:text-tg-text"
              }`}
            >
              {metricConfig[key].label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-72 items-center justify-center border-t border-dashed border-tg-border text-sm text-tg-secondary">
          پس از همگام‌سازی، روند روزانه اینجا نمایش داده می‌شود.
        </div>
      ) : (
        <div className="h-72 min-w-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="var(--tg-border)" strokeDasharray="3 5" />
              <XAxis dataKey="dateLabel" stroke="var(--tg-secondary)" tickLine={false} axisLine={false} minTickGap={24} fontSize={11} />
              <YAxis stroke="var(--tg-secondary)" tickLine={false} axisLine={false} width={48} tickFormatter={(value) => formatAnalyticsNumber(Number(value), "compact")} fontSize={11} />
              <Tooltip
                formatter={(value) => [config.format(Number(value)), config.label]}
                contentStyle={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)", borderRadius: 8, color: "var(--tg-text)", direction: "rtl" }}
                labelStyle={{ color: "var(--tg-secondary)" }}
              />
              <Line type="monotone" dataKey={metric} name={config.label} stroke="var(--tg-accent)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
