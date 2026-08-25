import { DateTime } from "luxon";

import {
  analyticsRepository,
  type ContentAggregateFilter,
  type ContentAggregate,
  type AnalyticsSnapshotFilter,
  type AnalyticsSnapshotRecord,
} from "@/lib/analytics/repository";
import { aggregateDailyMetrics, buildAnalyticsPeriod, calculateEngagementRate } from "@/lib/analytics/ranges";
import { normalizeAllowedAccountIds } from "@/lib/permissions";
import type {
  AnalyticsChartPoint,
  AnalyticsExportFilter,
  AnalyticsExportRow,
  AnalyticsFreshness,
  AnalyticsFreshnessState,
  AnalyticsOverview,
  AnalyticsRange,
  ContentAnalytics,
  MetricTotals,
  PeriodComparison,
} from "@/lib/analytics/types";

const TIMEZONE = "Asia/Tehran";
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export type AnalyticsSnapshotReadRecord = AnalyticsSnapshotRecord;

export interface AnalyticsAccountStatus {
  accountId: string;
  lastSyncAt: Date | null;
  lastError: string | null;
  lastErrorCode?: string | null;
  nextAttemptAt?: Date | null;
}

export interface AnalyticsQueryRepository {
  readSnapshots(filter: AnalyticsSnapshotFilter): Promise<AnalyticsSnapshotReadRecord[]>;
  readAccountStatuses?(accountIds?: readonly string[]): Promise<AnalyticsAccountStatus[]>;
  aggregateContentByAccount(input: ContentAggregateFilter): Promise<ContentAggregate>;
}

export class AnalyticsAccessError extends Error {
  constructor() {
    super("Analytics account access denied");
    this.name = "AnalyticsAccessError";
  }
}

interface MetricRow {
  dateUtc: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  subscribersGained?: number;
  subscribersLost?: number;
}

const emptyTotals = (): MetricTotals => ({
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  watchTimeMinutes: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  subscriberGrowth: 0,
  engagementRate: 0,
});

function totals(rows: readonly MetricRow[]): MetricTotals {
  return aggregateDailyMetrics(rows.map((row) => ({
    date: row.dateUtc,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    watchTimeMinutes: row.watchTimeMinutes,
    subscribersGained: row.subscribersGained ?? 0,
    subscribersLost: row.subscribersLost ?? 0,
  })));
}

function percentageChange(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

function comparison(currentRows: readonly MetricRow[], previousRows: readonly MetricRow[]): PeriodComparison {
  const current = totals(currentRows);
  const previous = totals(previousRows);
  return {
    current,
    previous,
    percentageChanges: {
      views: percentageChange(current.views, previous.views),
      likes: percentageChange(current.likes, previous.likes),
      comments: percentageChange(current.comments, previous.comments),
      shares: percentageChange(current.shares, previous.shares),
      watchTimeMinutes: percentageChange(current.watchTimeMinutes, previous.watchTimeMinutes),
      subscriberGrowth: percentageChange(current.subscriberGrowth, previous.subscriberGrowth),
      engagementRate: percentageChange(current.engagementRate, previous.engagementRate),
    },
  };
}

function pointForDate(date: Date, rows: readonly MetricRow[]): AnalyticsChartPoint {
  const sum = totals(rows);
  const viewed = rows.reduce((total, row) => total + row.views, 0);
  const weightedDuration = rows.reduce(
    (total, row) => total + row.averageViewDurationSeconds * row.views,
    0,
  );
  return {
    date,
    views: sum.views,
    likes: sum.likes,
    comments: sum.comments,
    shares: sum.shares,
    watchTimeMinutes: sum.watchTimeMinutes,
    averageViewDurationSeconds: viewed === 0 ? 0 : weightedDuration / viewed,
    subscribersGained: sum.subscribersGained,
    subscribersLost: sum.subscribersLost,
    engagementRate: sum.engagementRate,
  };
}

function chartSeries(
  rows: readonly MetricRow[],
  currentStart: Date,
  range: AnalyticsRange,
): AnalyticsChartPoint[] {
  const byDay = new Map<number, MetricRow[]>();
  for (const row of rows) {
    const key = row.dateUtc.getTime();
    const dayRows = byDay.get(key) ?? [];
    dayRows.push(row);
    byDay.set(key, dayRows);
  }
  return Array.from({ length: range }, (_, index) => {
    const date = DateTime.fromJSDate(currentStart, { zone: TIMEZONE }).plus({ days: index }).toJSDate();
    return pointForDate(date, byDay.get(date.getTime()) ?? []);
  });
}

function freshnessState(status: AnalyticsAccountStatus, now: Date): AnalyticsFreshnessState {
  if (status.lastError) return "error";
  if (!status.lastSyncAt) return "never";
  return now.getTime() - status.lastSyncAt.getTime() > STALE_AFTER_MS ? "stale" : "fresh";
}

function buildFreshness(statuses: readonly AnalyticsAccountStatus[], now: Date): AnalyticsFreshness {
  const accounts = statuses.map((status) => ({
    ...status,
    lastErrorCode: status.lastErrorCode ?? null,
    nextAttemptAt: status.nextAttemptAt ?? null,
    state: freshnessState(status, now),
  }));
  const priority: AnalyticsFreshnessState[] = ["error", "never", "stale", "fresh"];
  const state = priority.find((candidate) => accounts.some((account) => account.state === candidate)) ?? "never";
  const latest = accounts.reduce<Date | null>(
    (value, account) => !value || (account.lastSyncAt && account.lastSyncAt > value)
      ? account.lastSyncAt
      : value,
    null,
  );
  return { state, lastSyncedAt: latest, accounts };
}

function allowedFilter(
  accountId: string | undefined,
  allowedAccountIds: readonly string[] | null,
): readonly string[] | undefined {
  const allowed = normalizeAllowedAccountIds(allowedAccountIds);
  if (accountId && allowed !== null && !allowed.includes(accountId)) {
    throw new AnalyticsAccessError();
  }
  return accountId ? [accountId] : allowed ?? undefined;
}

export function createAnalyticsQueryService(repository: AnalyticsQueryRepository): {
  getOverview(input: { range: AnalyticsRange; accountId?: string; allowedAccountIds: readonly string[] | null; now?: Date }): Promise<AnalyticsOverview>;
  getContent(input: { externalVideoId: string; range: AnalyticsRange; allowedAccountIds: readonly string[] | null; now?: Date }): Promise<ContentAnalytics | null>;
  getExportRows(input: AnalyticsExportFilter & { allowedAccountIds: readonly string[] | null }): Promise<AnalyticsExportRow[]>;
} {
  return {
    async getOverview(input) {
      const now = input.now ?? new Date();
      const period = buildAnalyticsPeriod(input.range, now, TIMEZONE);
      const accountIds = allowedFilter(input.accountId, input.allowedAccountIds);
      const statuses = repository.readAccountStatuses
        ? await repository.readAccountStatuses(accountIds)
        : [];
      const rows = accountIds?.length === 0
        ? []
        : await repository.readSnapshots({
            ...(accountIds ? { accountIds } : {}),
            startDateInclusive: period.previousStart,
            endDateExclusive: period.currentEnd,
          });
      const allowed = accountIds ? new Set(accountIds) : null;
      const visibleRows = allowed ? rows.filter((row) => allowed.has(row.accountId)) : rows;
      const currentRows = visibleRows.filter((row) => row.dateUtc >= period.currentStart);
      const previousRows = visibleRows.filter((row) => row.dateUtc < period.currentStart);
      const currentAccountRows = currentRows.filter((row) => row.scopeType === "account");
      const previousAccountRows = previousRows.filter((row) => row.scopeType === "account");
      const accountMetadata = new Map<string, { accountId: string; channelId: string; channelTitle: string }>();
      for (const row of visibleRows) {
        accountMetadata.set(row.accountId, {
          accountId: row.accountId,
          channelId: row.channelId,
          channelTitle: row.channelTitle,
        });
      }
      const latestSubscribers = new Map<string, { date: Date; value: number }>();
      for (const row of visibleRows) {
        if (row.scopeType !== "account" || row.subscribersTotal === null) continue;
        const latest = latestSubscribers.get(row.accountId);
        if (!latest || row.dateUtc > latest.date) {
          latestSubscribers.set(row.accountId, { date: row.dateUtc, value: row.subscribersTotal });
        }
      }
      const topGroups = new Map<string, Extract<AnalyticsSnapshotReadRecord, { scopeType: "content" }>[]>();
      const previousTopGroups = new Map<string, Extract<AnalyticsSnapshotReadRecord, { scopeType: "content" }>[]>();
      for (const row of currentRows) {
        if (row.scopeType !== "content") continue;
        const key = `${row.accountId}\u0000${row.videoId}`;
        topGroups.set(key, [...(topGroups.get(key) ?? []), row]);
      }
      for (const row of previousRows) {
        if (row.scopeType !== "content") continue;
        const key = `${row.accountId}\u0000${row.videoId}`;
        previousTopGroups.set(key, [...(previousTopGroups.get(key) ?? []), row]);
      }
      const topVideos = [...topGroups.entries()].map(([key, videoRows]) => {
        const latest = [...videoRows].sort((a, b) => b.dateUtc.getTime() - a.dateUtc.getTime())[0];
        return {
          accountId: latest.accountId,
          channelId: latest.channelId,
          channelTitle: latest.channelTitle,
          contentId: latest.contentId,
          videoId: latest.videoId,
          title: latest.title,
          thumbnailUrl: latest.thumbnailUrl,
          publishedAt: latest.publishedAt,
          totals: totals(videoRows),
          percentageChanges: comparison(videoRows, previousTopGroups.get(key) ?? []).percentageChanges,
        };
      }).sort((a, b) => b.totals.views - a.totals.views || a.videoId.localeCompare(b.videoId)).slice(0, 20);

      return {
        scope: "overview",
        hasSnapshotData: visibleRows.length > 0,
        accounts: [...accountMetadata.values()].sort((a, b) => a.accountId.localeCompare(b.accountId)),
        range: input.range,
        currentStart: period.currentStart,
        currentEnd: period.currentEnd,
        comparison: comparison(currentAccountRows, previousAccountRows),
        chartSeries: chartSeries(currentAccountRows, period.currentStart, input.range),
        topVideos,
        subscribersTotal: latestSubscribers.size === 0
          ? null
          : [...latestSubscribers.values()].reduce((sum, item) => sum + item.value, 0),
        freshness: buildFreshness(statuses.filter((status) => !allowed || allowed.has(status.accountId)), now),
      };
    },

    async getContent(input) {
      const now = input.now ?? new Date();
      const period = buildAnalyticsPeriod(input.range, now, TIMEZONE);
      const accountIds = normalizeAllowedAccountIds(input.allowedAccountIds) ?? undefined;
      const rows = await repository.readSnapshots({
        ...(accountIds ? { accountIds } : {}),
        scopeType: "content",
        scopeId: input.externalVideoId,
        startDateInclusive: period.previousStart,
        endDateExclusive: period.currentEnd,
      });
      const allowed = accountIds ? new Set(accountIds) : null;
      const visibleRows = rows.filter((row): row is Extract<AnalyticsSnapshotReadRecord, { scopeType: "content" }> =>
        row.scopeType === "content" && (!allowed || allowed.has(row.accountId))
      );
      const targetRows = visibleRows.filter((row) => row.videoId === input.externalVideoId);
      if (targetRows.length === 0) return null;
      const accountId = targetRows[0].accountId;
      const currentTarget = targetRows.filter((row) => row.dateUtc >= period.currentStart);
      const previousTarget = targetRows.filter((row) => row.dateUtc < period.currentStart);
      const latest = [...targetRows].sort((a, b) => b.dateUtc.getTime() - a.dateUtc.getTime())[0];
      const contentTotals = totals(currentTarget);
      const aggregate = await repository.aggregateContentByAccount({
        accountId,
        startDateInclusive: period.currentStart,
        endDateExclusive: period.currentEnd,
      });
      const channelAverageBase = {
        views: aggregate.views,
        likes: aggregate.likes,
        comments: aggregate.comments,
        shares: aggregate.shares,
        watchTimeMinutes: aggregate.watchTimeMinutes,
        subscribersGained: 0,
        subscribersLost: 0,
        subscriberGrowth: 0,
      };
      const channelAverage: MetricTotals = {
        ...channelAverageBase,
        engagementRate: calculateEngagementRate(channelAverageBase),
      };
      const statuses = repository.readAccountStatuses
        ? await repository.readAccountStatuses([accountId])
        : [];
      return {
        scope: "content",
        accountId,
        channelId: latest.channelId,
        channelTitle: latest.channelTitle,
        contentId: latest.contentId,
        videoId: latest.videoId,
        title: latest.title,
        thumbnailUrl: latest.thumbnailUrl,
        publishedAt: latest.publishedAt,
        range: input.range,
        currentStart: period.currentStart,
        currentEnd: period.currentEnd,
        comparison: comparison(currentTarget, previousTarget),
        channelAverageComparison: {
          content: contentTotals,
          channelAverage,
          percentageDifferences: {
            views: percentageChange(contentTotals.views, channelAverage.views),
            likes: percentageChange(contentTotals.likes, channelAverage.likes),
            comments: percentageChange(contentTotals.comments, channelAverage.comments),
            shares: percentageChange(contentTotals.shares, channelAverage.shares),
            watchTimeMinutes: percentageChange(contentTotals.watchTimeMinutes, channelAverage.watchTimeMinutes),
            subscriberGrowth: percentageChange(contentTotals.subscriberGrowth, channelAverage.subscriberGrowth),
            engagementRate: percentageChange(contentTotals.engagementRate, channelAverage.engagementRate),
          },
        },
        chartSeries: chartSeries(currentTarget, period.currentStart, input.range),
        freshness: buildFreshness(statuses, now),
      };
    },

    async getExportRows(input) {
      const accountIds = allowedFilter(input.accountId ?? undefined, input.allowedAccountIds);
      if (accountIds?.length === 0) return [];
      const filter: AnalyticsSnapshotFilter = {
        ...(accountIds ? { accountIds } : {}),
        scopeType: input.scope,
        ...(input.contentId ? { scopeId: input.contentId } : {}),
        startDateInclusive: input.startDate,
        endDateExclusive: input.endDate,
      };
      const rows = await repository.readSnapshots(filter);
      const allowed = accountIds ? new Set(accountIds) : null;
      return rows.filter((row) =>
        row.scopeType === input.scope
        && (!allowed || allowed.has(row.accountId))
        && (!input.contentId || row.scopeId === input.contentId)
        && row.dateUtc >= input.startDate
        && row.dateUtc < input.endDate
      ).map((row): AnalyticsExportRow => ({
        scope: row.scopeType as AnalyticsExportRow["scope"],
        date: row.dateUtc,
        accountId: row.accountId,
        channelId: row.channelId,
        channelTitle: row.channelTitle,
        contentId: row.scopeType === "content" ? row.contentId : null,
        videoId: row.scopeType === "content" ? row.videoId : null,
        title: row.scopeType === "content" ? row.title : null,
        views: row.views,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        watchTimeMinutes: row.watchTimeMinutes,
        averageViewDurationSeconds: row.averageViewDurationSeconds,
        subscribersTotal: row.scopeType === "account" ? row.subscribersTotal : null,
        subscribersGained: row.scopeType === "account" ? row.subscribersGained : 0,
        subscribersLost: row.scopeType === "account" ? row.subscribersLost : 0,
        engagementRate: calculateEngagementRate(row),
        fetchedAt: row.fetchedAt,
      }));
    },
  };
}

const analyticsQueryService = createAnalyticsQueryService(analyticsRepository);

export const getAnalyticsOverview = analyticsQueryService.getOverview;
export const getContentAnalytics = analyticsQueryService.getContent;
export const getAnalyticsExportRows = analyticsQueryService.getExportRows;
