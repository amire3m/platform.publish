export type AnalyticsRange = 7 | 30 | 90;

export interface DailyMetric {
  date: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
}

export interface MetricTotals {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeMinutes: number;
  subscribersGained: number;
  subscribersLost: number;
  subscriberGrowth: number;
  engagementRate: number;
}

export interface PeriodComparison {
  current: MetricTotals;
  previous: MetricTotals;
  percentageChanges: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    watchTimeMinutes: number | null;
    subscriberGrowth: number | null;
    engagementRate: number | null;
  };
}

export interface AnalyticsChartPoint extends DailyMetric {
  subscribersGained: number;
  subscribersLost: number;
  engagementRate: number;
}

export type AnalyticsFreshnessState = "fresh" | "stale" | "error" | "never";

export interface AnalyticsFreshness {
  state: AnalyticsFreshnessState;
  lastSyncedAt: Date | null;
  accounts: readonly {
    accountId: string;
    state: AnalyticsFreshnessState;
    lastSyncAt: Date | null;
    lastError: string | null;
    lastErrorCode: string | null;
    nextAttemptAt: Date | string | null;
  }[];
}

export interface AnalyticsFetchInput {
  accountId: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
}

export interface AccountDailyMetric extends DailyMetric {
  accountId: string;
  channelId: string;
  channelTitle: string;
  subscribersTotal: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface ContentDailyMetric extends DailyMetric {
  accountId: string;
  channelId: string;
  channelTitle: string;
  contentId: string | null;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
}

interface AnalyticsSnapshotBase {
  platform: "youtube";
  accountId: string;
  scopeId: string;
  date: Date;
  fetchedAt: Date;
}

export interface AccountAnalyticsSnapshotInput extends AnalyticsSnapshotBase {
  scopeType: "account";
  metrics: AccountSnapshotMetrics;
  metadata: AccountSnapshotMetadata;
}

export interface ContentAnalyticsSnapshotInput extends AnalyticsSnapshotBase {
  scopeType: "content";
  metrics: ContentSnapshotMetrics;
  metadata: ContentSnapshotMetadata;
}

export type AnalyticsSnapshotInput =
  | AccountAnalyticsSnapshotInput
  | ContentAnalyticsSnapshotInput;

export interface AccountSnapshotMetrics {
  metricType: "account";
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  subscribersTotal: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface ContentSnapshotMetrics {
  metricType: "content";
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
}

export interface AccountSnapshotMetadata {
  metadataType: "account";
  channelId: string;
  channelTitle: string;
}

export interface ContentSnapshotMetadata {
  metadataType: "content";
  contentId: string | null;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  channelId: string;
  channelTitle: string;
}

export interface AnalyticsOverview {
  scope: "overview";
  hasSnapshotData: boolean;
  accounts: readonly {
    accountId: string;
    channelId: string;
    channelTitle: string;
  }[];
  range: AnalyticsRange;
  currentStart: Date;
  currentEnd: Date;
  comparison: PeriodComparison;
  chartSeries: readonly AnalyticsChartPoint[];
  topVideos: readonly {
    accountId: string;
    channelId: string;
    channelTitle: string;
    contentId: string | null;
    videoId: string;
    title: string;
    thumbnailUrl: string | null;
    publishedAt: Date | null;
    totals: MetricTotals;
    percentageChanges: PeriodComparison["percentageChanges"];
  }[];
  subscribersTotal: number | null;
  freshness: AnalyticsFreshness;
}

export interface ContentAnalytics {
  scope: "content";
  accountId: string;
  channelId: string;
  channelTitle: string;
  contentId: string | null;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  range: AnalyticsRange;
  currentStart: Date;
  currentEnd: Date;
  comparison: PeriodComparison;
  channelAverageComparison: {
    content: MetricTotals;
    channelAverage: MetricTotals;
    percentageDifferences: PeriodComparison["percentageChanges"];
  };
  chartSeries: readonly AnalyticsChartPoint[];
  freshness: AnalyticsFreshness;
}

export interface AnalyticsExportFilter {
  scope: "account" | "content";
  range: AnalyticsRange;
  accountId: string | null;
  contentId: string | null;
  startDate: Date;
  endDate: Date;
}

export interface AnalyticsExportRow {
  scope: "account" | "content";
  date: Date;
  accountId: string;
  channelId: string;
  channelTitle: string;
  contentId: string | null;
  videoId: string | null;
  title: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  subscribersTotal: number | null;
  subscribersGained: number;
  subscribersLost: number;
  engagementRate: number;
  fetchedAt: Date;
}
