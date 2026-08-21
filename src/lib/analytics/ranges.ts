import { DateTime } from "luxon";

import type { AnalyticsRange, MetricTotals } from "@/lib/analytics/types";

interface EngagementMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

interface AggregatableDailyMetric extends EngagementMetrics {
  date: Date;
  watchTimeMinutes: number;
  subscribersGained: number;
  subscribersLost: number;
}

export function parseAnalyticsRange(value: unknown): AnalyticsRange | null {
  if (value === "7" || value === "30" || value === "90") {
    return Number(value) as AnalyticsRange;
  }

  return null;
}

export function buildAnalyticsPeriod(
  range: AnalyticsRange,
  now: Date,
  timezone: string,
): {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
} {
  const zonedNow = DateTime.fromJSDate(now, { zone: timezone });
  if (!zonedNow.isValid) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  const currentEnd = zonedNow.startOf("day");
  const currentStart = currentEnd.minus({ days: range });
  const previousEnd = currentStart;
  const previousStart = previousEnd.minus({ days: range });

  return {
    currentStart: currentStart.toJSDate(),
    currentEnd: currentEnd.toJSDate(),
    previousStart: previousStart.toJSDate(),
    previousEnd: previousEnd.toJSDate(),
  };
}

export function aggregateDailyMetrics(
  rows: readonly AggregatableDailyMetric[],
): MetricTotals {
  const totals = rows.reduce(
    (sum, row) => ({
      views: sum.views + row.views,
      likes: sum.likes + row.likes,
      comments: sum.comments + row.comments,
      shares: sum.shares + row.shares,
      watchTimeMinutes: sum.watchTimeMinutes + row.watchTimeMinutes,
      subscribersGained: sum.subscribersGained + row.subscribersGained,
      subscribersLost: sum.subscribersLost + row.subscribersLost,
    }),
    {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      watchTimeMinutes: 0,
      subscribersGained: 0,
      subscribersLost: 0,
    },
  );

  return {
    ...totals,
    subscriberGrowth: totals.subscribersGained - totals.subscribersLost,
    engagementRate: calculateEngagementRate(totals),
  };
}

export function calculateEngagementRate(metrics: EngagementMetrics): number {
  if (metrics.views === 0) {
    return 0;
  }

  return ((metrics.likes + metrics.comments + metrics.shares) / metrics.views) * 100;
}
