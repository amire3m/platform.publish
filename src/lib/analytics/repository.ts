import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { analyticsSnapshots, credentials, socialAccounts } from "@/db/schema";
import { formatJalaliSlash, startOfTehranDayUtc } from "@/lib/date/jalali";
import { generateEntityId } from "@/lib/ids";
import type { AnalyticsSnapshotInput } from "@/lib/analytics/types";

const LEASE_DURATION_MS = 30 * 60 * 1000;
const UPSERT_CHUNK_SIZE = 500;

export const ANALYTICS_SNAPSHOT_CONFLICT_TARGET = [
  analyticsSnapshots.platform,
  analyticsSnapshots.accountId,
  analyticsSnapshots.scopeType,
  analyticsSnapshots.scopeId,
  analyticsSnapshots.dateUtc,
];

export function buildAcquireLeaseCondition(accountId: string, staleBefore: Date): SQL {
  return and(
    eq(socialAccounts.id, accountId),
    or(
      isNull(socialAccounts.analyticsSyncLockedAt),
      lt(socialAccounts.analyticsSyncLockedAt, staleBefore),
    ),
  )!;
}

export function buildReleaseLeaseCondition(accountId: string, lockId: string): SQL {
  return and(
    eq(socialAccounts.id, accountId),
    eq(socialAccounts.analyticsSyncLockId, lockId),
  )!;
}

export function buildSnapshotFilterCondition(filter: AnalyticsSnapshotFilter): SQL {
  const filters = [eq(analyticsSnapshots.platform, "youtube")];
  if (filter.accountIds) filters.push(inArray(analyticsSnapshots.accountId, filter.accountIds));
  if (filter.scopeType) filters.push(eq(analyticsSnapshots.scopeType, filter.scopeType));
  if (filter.scopeId) filters.push(eq(analyticsSnapshots.scopeId, filter.scopeId));
  if (filter.startDateInclusive) {
    filters.push(gte(analyticsSnapshots.dateUtc, filter.startDateInclusive));
  }
  if (filter.endDateExclusive) {
    filters.push(lt(analyticsSnapshots.dateUtc, filter.endDateExclusive));
  }
  return and(...filters)!;
}

export interface SyncableAccount {
  id: string;
  externalAccountId: string;
  displayName: string;
  encryptedCredential: string;
  lastSyncAt: Date | null;
}

export interface AnalyticsRepository {
  acquireLease(accountId: string, lockId: string, now: Date): Promise<boolean>;
  releaseLease(accountId: string, lockId: string): Promise<void>;
  upsertSnapshots(rows: readonly AnalyticsSnapshotInput[]): Promise<number>;
  commitSync(accountId: string, lockId: string, syncedAt: Date, syncedThrough: Date, rows: readonly AnalyticsSnapshotInput[]): Promise<number>;
  getAnalyticsSyncedThrough(accountId: string): Promise<Date | null>;
  listSyncableAccounts(accountIds?: readonly string[]): Promise<SyncableAccount[]>;
  markSyncSuccess(accountId: string, syncedAt: Date): Promise<void>;
  markSyncFailure(accountId: string, lockId: string | null, error: string, code: string, nextAttemptAt: Date | null): Promise<void>;
  readSnapshots(filter: AnalyticsSnapshotFilter): Promise<AnalyticsSnapshotRecord[]>;
  readAccountStatuses?(accountIds?: readonly string[]): Promise<AnalyticsAccountSyncStatus[]>;
  aggregateContentByAccount(input: ContentAggregateFilter): Promise<ContentAggregate>;
}

export interface AnalyticsAccountSyncStatus {
  accountId: string;
  lastSyncAt: Date | null;
  lastError: string | null;
  lastErrorCode: string | null;
  nextAttemptAt: Date | null;
}

export interface ContentAggregateFilter {
  accountId: string;
  startDateInclusive: Date;
  endDateExclusive: Date;
}

export interface ContentAggregate {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  videoCount: number;
}

export type AnalyticsSnapshotScopeType =
  | "account"
  | "content"
  | "geo"
  | "age_gender"
  | "device"
  | "traffic"
  | "search"
  | "retention";

export interface AnalyticsSnapshotFilter {
  accountIds?: readonly string[];
  scopeType?: AnalyticsSnapshotScopeType;
  scopeId?: string;
  startDateInclusive?: Date;
  endDateExclusive?: Date;
}

interface AnalyticsSnapshotRecordBase {
  id: string;
  platform: "youtube";
  accountId: string;
  scopeId: string;
  dateJalali: string;
  dateUtc: Date;
  fetchedAt: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  impressions: number | null;
  ctr: number | null;
  estimatedRevenue: number | null;
  cpm: number | null;
  averageViewPercentage?: number | null;
}

export interface AccountAnalyticsSnapshotRecord extends AnalyticsSnapshotRecordBase {
  scopeType: "account";
  channelId: string;
  channelTitle: string;
  subscribersTotal: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface ContentAnalyticsSnapshotRecord extends AnalyticsSnapshotRecordBase {
  scopeType: "content";
  contentId: string | null;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  channelId: string;
  channelTitle: string;
}

export interface GeoAnalyticsSnapshotRecord extends AnalyticsSnapshotRecordBase {
  scopeType: "geo";
  channelId: string;
  channelTitle: string;
  country: string;
}

export interface AgeGenderAnalyticsSnapshotRecord extends AnalyticsSnapshotRecordBase {
  scopeType: "age_gender";
  channelId: string;
  channelTitle: string;
  ageGroup: string;
  gender: string;
}

export interface DeviceAnalyticsSnapshotRecord extends AnalyticsSnapshotRecordBase {
  scopeType: "device";
  channelId: string;
  channelTitle: string;
  deviceType: string;
}

export interface TrafficAnalyticsSnapshotRecord extends AnalyticsSnapshotRecordBase {
  scopeType: "traffic";
  channelId: string;
  channelTitle: string;
  trafficSource: string;
}

export interface SearchAnalyticsSnapshotRecord extends AnalyticsSnapshotRecordBase {
  scopeType: "search";
  channelId: string;
  channelTitle: string;
  keyword: string;
}

export interface RetentionAnalyticsSnapshotRecord extends AnalyticsSnapshotRecordBase {
  scopeType: "retention";
  channelId: string;
  channelTitle: string;
  videoId: string;
  averageViewPercentage: number | null;
}

export type AnalyticsSnapshotRecord =
  | AccountAnalyticsSnapshotRecord
  | ContentAnalyticsSnapshotRecord
  | GeoAnalyticsSnapshotRecord
  | AgeGenderAnalyticsSnapshotRecord
  | DeviceAnalyticsSnapshotRecord
  | TrafficAnalyticsSnapshotRecord
  | SearchAnalyticsSnapshotRecord
  | RetentionAnalyticsSnapshotRecord;

export interface AnalyticsSnapshotPersistenceRow {
  id: string;
  platform: "youtube";
  accountId: string;
  scopeType: AnalyticsSnapshotScopeType;
  scopeId: string;
  contentTitle: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  dateJalali: string;
  dateUtc: Date;
  followersOrSubscribers: number | null;
  subscribersGained: number;
  subscribersLost: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTime: number;
  averageViewDuration: string;
  impressions: number | null;
  ctr: number | null;
  estimatedRevenue: string | null;
  cpm: string | null;
  rawMetrics: Record<string, unknown>;
}

export interface AnalyticsSnapshotDatabaseRow {
  id: string;
  platform: string;
  accountId: string;
  scopeType: string;
  scopeId: string;
  dateJalali: string;
  dateUtc: Date;
  createdAt: Date;
  accountExternalId: string | null;
  accountDisplayName: string | null;
  contentTitle: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  followersOrSubscribers: number | null;
  subscribersGained: number | null;
  subscribersLost: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  watchTime: number | null;
  averageViewDuration: string | null;
  impressions: number | null;
  ctr: number | null;
  estimatedRevenue: string | number | null;
  cpm: string | number | null;
  rawMetrics: Record<string, unknown>;
}

export interface AnalyticsAccountCandidate {
  id: string;
  platform: string;
  externalAccountId: string | null;
  displayName: string;
  active: boolean;
  connectionStatus: string;
  credentialRef: string | null;
  credentialProvider: string | null;
  encryptedCredential: string | null;
  lastSyncAt: Date | null;
}

export interface AnalyticsDatabasePort {
  acquireLease(
    accountId: string,
    lockId: string,
    now: Date,
    staleBefore: Date,
  ): Promise<boolean>;
  releaseLease(accountId: string, lockId: string): Promise<void>;
  upsertSnapshotChunk(rows: readonly AnalyticsSnapshotPersistenceRow[]): Promise<number>;
  commitSync(
    accountId: string,
    lockId: string,
    syncedAt: Date,
    syncedThrough: Date,
    chunks: readonly (readonly AnalyticsSnapshotPersistenceRow[])[],
  ): Promise<number>;
  getAnalyticsSyncedThrough(accountId: string): Promise<Date | null>;
  listAccountCandidates(accountIds?: readonly string[]): Promise<AnalyticsAccountCandidate[]>;
  markSyncSuccess(accountId: string, syncedAt: Date): Promise<void>;
  markSyncFailure(accountId: string, lockId: string | null, error: string, code: string, nextAttemptAt: Date | null): Promise<void>;
  readSnapshots(filter: AnalyticsSnapshotFilter): Promise<AnalyticsSnapshotDatabaseRow[]>;
  readAccountStatuses?(accountIds?: readonly string[]): Promise<AnalyticsAccountSyncStatus[]>;
  aggregateContentByAccount(input: ContentAggregateFilter): Promise<ContentAggregate>;
}

type MappedSnapshotPersistenceRow = Omit<AnalyticsSnapshotPersistenceRow, "id">;

const ALLOWED_SCOPE_TYPES = new Set<AnalyticsSnapshotScopeType>([
  "account",
  "content",
  "geo",
  "age_gender",
  "device",
  "traffic",
  "search",
  "retention",
]);

const commonRawMetricsSchema = {
  views: z.number().finite(),
  likes: z.number().finite(),
  comments: z.number().finite(),
  shares: z.number().finite(),
  watchTimeMinutes: z.number().finite(),
  averageViewDurationSeconds: z.number().finite(),
  fetchedAt: z.string().datetime({ offset: true }),
  impressions: z.number().finite().nullable().optional(),
  ctr: z.number().finite().nullable().optional(),
  estimatedRevenue: z.number().finite().nullable().optional(),
  cpm: z.number().finite().nullable().optional(),
  averageViewPercentage: z.number().finite().nullable().optional(),
};

const accountRawMetricsSchema = z.object({
  metricType: z.literal("account"),
  ...commonRawMetricsSchema,
  subscribersTotal: z.number().finite().nullable(),
  subscribersGained: z.number().finite(),
  subscribersLost: z.number().finite(),
  metadataType: z.literal("account"),
  channelId: z.string(),
  channelTitle: z.string(),
});

const contentRawMetricsSchema = z.object({
  metricType: z.literal("content"),
  ...commonRawMetricsSchema,
  metadataType: z.literal("content"),
  contentId: z.string().nullable(),
  videoId: z.string(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  channelId: z.string(),
  channelTitle: z.string(),
});

const geoRawMetricsSchema = z.object({
  metricType: z.literal("geo"),
  ...commonRawMetricsSchema,
  metadataType: z.literal("geo"),
  channelId: z.string(),
  channelTitle: z.string(),
  country: z.string(),
});

const ageGenderRawMetricsSchema = z.object({
  metricType: z.literal("age_gender"),
  ...commonRawMetricsSchema,
  metadataType: z.literal("age_gender"),
  channelId: z.string(),
  channelTitle: z.string(),
  ageGroup: z.string(),
  gender: z.string(),
});

const deviceRawMetricsSchema = z.object({
  metricType: z.literal("device"),
  ...commonRawMetricsSchema,
  metadataType: z.literal("device"),
  channelId: z.string(),
  channelTitle: z.string(),
  deviceType: z.string(),
});

const trafficRawMetricsSchema = z.object({
  metricType: z.literal("traffic"),
  ...commonRawMetricsSchema,
  metadataType: z.literal("traffic"),
  channelId: z.string(),
  channelTitle: z.string(),
  trafficSource: z.string(),
});

const searchRawMetricsSchema = z.object({
  metricType: z.literal("search"),
  ...commonRawMetricsSchema,
  metadataType: z.literal("search"),
  channelId: z.string(),
  channelTitle: z.string(),
  keyword: z.string(),
});

const retentionRawMetricsSchema = z.object({
  metricType: z.literal("retention"),
  ...commonRawMetricsSchema,
  metadataType: z.literal("retention"),
  channelId: z.string(),
  channelTitle: z.string(),
  videoId: z.string(),
  title: z.string().optional(),
});

const DIMENSION_RAW_METRICS_SCHEMAS: Record<AnalyticsSnapshotScopeType, z.ZodObject<z.ZodRawShape> | null> = {
  account: accountRawMetricsSchema,
  content: contentRawMetricsSchema,
  geo: geoRawMetricsSchema,
  age_gender: ageGenderRawMetricsSchema,
  device: deviceRawMetricsSchema,
  traffic: trafficRawMetricsSchema,
  search: searchRawMetricsSchema,
  retention: retentionRawMetricsSchema,
};

export function mapSnapshot(row: AnalyticsSnapshotInput): MappedSnapshotPersistenceRow {
  if (row.scopeType === "account" && row.scopeId !== row.accountId) {
    throw new Error("Account snapshot scopeId must match accountId");
  }

  const dateUtc = startOfTehranDayUtc(row.date);
  const metricsAny = row.metrics as unknown as Record<string, unknown>;
  const impressionsRaw = metricsAny.impressions as number | null | undefined;
  const impressions = impressionsRaw ?? null;
  let ctr: number | null = (metricsAny.ctr as number | null | undefined) ?? null;
  if (ctr == null && impressions != null && impressions > 0) {
    ctr = (row.metrics.views as number) / impressions;
  }
  const estimatedRevenueRaw = metricsAny.estimatedRevenue as number | null | undefined;
  const cpmRaw = metricsAny.cpm as number | null | undefined;
  const averageViewPercentageRaw = metricsAny.averageViewPercentage as number | null | undefined;

  let rawMetrics: Record<string, unknown>;
  let contentTitle: string | null = null;
  let thumbnailUrl: string | null = null;
  let publishedAt: Date | null = null;
  let followersOrSubscribers: number | null = null;
  let subscribersGained = 0;
  let subscribersLost = 0;

  const baseMetrics = {
    views: row.metrics.views,
    likes: row.metrics.likes,
    comments: row.metrics.comments,
    shares: row.metrics.shares,
    watchTimeMinutes: row.metrics.watchTimeMinutes,
    averageViewDurationSeconds: row.metrics.averageViewDurationSeconds,
    impressions,
    ctr,
    estimatedRevenue: estimatedRevenueRaw ?? null,
    cpm: cpmRaw ?? null,
    averageViewPercentage: averageViewPercentageRaw ?? null,
  };

  switch (row.scopeType) {
    case "account": {
      const m = row.metrics as unknown as { subscribersTotal: number | null; subscribersGained: number; subscribersLost: number };
      const md = row.metadata as unknown as { channelId: string; channelTitle: string };
      followersOrSubscribers = m.subscribersTotal ?? null;
      subscribersGained = m.subscribersGained ?? 0;
      subscribersLost = m.subscribersLost ?? 0;
      rawMetrics = {
        metricType: row.metrics.metricType,
        ...baseMetrics,
        subscribersTotal: m.subscribersTotal,
        subscribersGained: m.subscribersGained,
        subscribersLost: m.subscribersLost,
        metadataType: (row.metadata as unknown as { metadataType: string }).metadataType,
        channelId: md.channelId,
        channelTitle: md.channelTitle,
        fetchedAt: row.fetchedAt.toISOString(),
      };
      break;
    }
    case "content": {
      const md = row.metadata as unknown as {
        contentId: string | null;
        videoId: string;
        title: string;
        thumbnailUrl: string | null;
        publishedAt: Date | null;
        channelId: string;
        channelTitle: string;
        metadataType: string;
      };
      contentTitle = md.title ?? null;
      thumbnailUrl = md.thumbnailUrl ?? null;
      publishedAt = md.publishedAt ?? null;
      rawMetrics = {
        metricType: row.metrics.metricType,
        ...baseMetrics,
        metadataType: md.metadataType,
        contentId: md.contentId,
        videoId: md.videoId,
        title: md.title,
        thumbnailUrl: md.thumbnailUrl,
        publishedAt: md.publishedAt?.toISOString() ?? null,
        channelId: md.channelId,
        channelTitle: md.channelTitle,
        fetchedAt: row.fetchedAt.toISOString(),
      };
      break;
    }
    case "geo": {
      const md = row.metadata as unknown as { channelId: string; channelTitle: string; country: string; metadataType: string };
      rawMetrics = {
        metricType: row.metrics.metricType,
        ...baseMetrics,
        metadataType: md.metadataType,
        channelId: md.channelId,
        channelTitle: md.channelTitle,
        country: md.country,
        fetchedAt: row.fetchedAt.toISOString(),
      };
      break;
    }
    case "age_gender": {
      const md = row.metadata as unknown as { channelId: string; channelTitle: string; ageGroup: string; gender: string; metadataType: string };
      rawMetrics = {
        metricType: row.metrics.metricType,
        ...baseMetrics,
        metadataType: md.metadataType,
        channelId: md.channelId,
        channelTitle: md.channelTitle,
        ageGroup: md.ageGroup,
        gender: md.gender,
        fetchedAt: row.fetchedAt.toISOString(),
      };
      break;
    }
    case "device": {
      const md = row.metadata as unknown as { channelId: string; channelTitle: string; deviceType: string; metadataType: string };
      rawMetrics = {
        metricType: row.metrics.metricType,
        ...baseMetrics,
        metadataType: md.metadataType,
        channelId: md.channelId,
        channelTitle: md.channelTitle,
        deviceType: md.deviceType,
        fetchedAt: row.fetchedAt.toISOString(),
      };
      break;
    }
    case "traffic": {
      const md = row.metadata as unknown as { channelId: string; channelTitle: string; trafficSource: string; metadataType: string };
      rawMetrics = {
        metricType: row.metrics.metricType,
        ...baseMetrics,
        metadataType: md.metadataType,
        channelId: md.channelId,
        channelTitle: md.channelTitle,
        trafficSource: md.trafficSource,
        fetchedAt: row.fetchedAt.toISOString(),
      };
      break;
    }
    case "search": {
      const md = row.metadata as unknown as { channelId: string; channelTitle: string; keyword: string; metadataType: string };
      rawMetrics = {
        metricType: row.metrics.metricType,
        ...baseMetrics,
        metadataType: md.metadataType,
        channelId: md.channelId,
        channelTitle: md.channelTitle,
        keyword: md.keyword,
        fetchedAt: row.fetchedAt.toISOString(),
      };
      break;
    }
    case "retention": {
      const md = row.metadata as unknown as { channelId: string; channelTitle: string; videoId: string; title?: string; metadataType: string };
      contentTitle = md.title ?? null;
      rawMetrics = {
        metricType: row.metrics.metricType,
        ...baseMetrics,
        metadataType: md.metadataType,
        channelId: md.channelId,
        channelTitle: md.channelTitle,
        videoId: md.videoId,
        title: md.title ?? null,
        fetchedAt: row.fetchedAt.toISOString(),
      };
      break;
    }
    default: {
      // Fallback for unknown future scopeTypes: allow passthrough
      const anyRow = row as unknown as { metadata: Record<string, unknown>; metrics: { metricType: string; views: number }; scopeType: string; fetchedAt: Date };
      const md = anyRow.metadata as unknown as Record<string, unknown>;
      rawMetrics = {
        metricType: (anyRow.metrics as unknown as { metricType: string }).metricType,
        ...baseMetrics,
        metadataType: (md.metadataType as string) ?? anyRow.scopeType,
        channelId: md.channelId,
        channelTitle: md.channelTitle,
        fetchedAt: anyRow.fetchedAt.toISOString(),
        ...md,
      };
      break;
    }
  }

  // Remove undefined extra keys that shouldn't be persisted
  for (const key of Object.keys(rawMetrics)) {
    if (rawMetrics[key] === undefined) delete rawMetrics[key];
  }

  // Ensure only allowlisted fields remain (strip secrets)
  // Already constructed from allowlist, so no extra leak

  return {
    platform: row.platform,
    accountId: row.accountId,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    contentTitle,
    thumbnailUrl,
    publishedAt,
    dateJalali: formatJalaliSlash(dateUtc).slice(0, 10),
    dateUtc,
    followersOrSubscribers,
    subscribersGained,
    subscribersLost,
    views: row.metrics.views,
    likes: row.metrics.likes,
    comments: row.metrics.comments,
    shares: row.metrics.shares,
    watchTime: row.metrics.watchTimeMinutes,
    averageViewDuration: String(row.metrics.averageViewDurationSeconds),
    impressions,
    ctr,
    estimatedRevenue: estimatedRevenueRaw != null ? String(estimatedRevenueRaw) : null,
    cpm: cpmRaw != null ? String(cpmRaw) : null,
    rawMetrics,
  };
}

function snapshotConflictKey(row: MappedSnapshotPersistenceRow): string {
  return [
    row.platform,
    row.accountId,
    row.scopeType,
    row.scopeId,
    row.dateUtc.toISOString(),
  ].join("\u0000");
}

function prepareSnapshotChunks(
  rows: readonly AnalyticsSnapshotInput[],
): AnalyticsSnapshotPersistenceRow[][] {
  const uniqueRows = new Map<string, MappedSnapshotPersistenceRow>();
  for (const row of rows) {
    const mapped = mapSnapshot(row);
    uniqueRows.set(snapshotConflictKey(mapped), mapped);
  }

  const rowsToWrite: AnalyticsSnapshotPersistenceRow[] = [...uniqueRows.values()]
    .map((row) => ({ ...row, id: generateEntityId("ANS") }));
  const chunks: AnalyticsSnapshotPersistenceRow[][] = [];
  for (let index = 0; index < rowsToWrite.length; index += UPSERT_CHUNK_SIZE) {
    chunks.push(rowsToWrite.slice(index, index + UPSERT_CHUNK_SIZE));
  }
  return chunks;
}

export function parseSnapshotRecord(
  row: AnalyticsSnapshotDatabaseRow,
  index: number,
): AnalyticsSnapshotRecord {
  const invalid = () => new Error(`Invalid analytics snapshot record at index ${index}`);
  if (
    row.platform !== "youtube" ||
    !ALLOWED_SCOPE_TYPES.has(row.scopeType as AnalyticsSnapshotScopeType) ||
    !(row.dateUtc instanceof Date) ||
    !Number.isFinite(row.dateUtc.getTime())
  ) {
    throw invalid();
  }

  const number = (value: number | string | null): number => {
    const parsed = typeof value === "number" ? value : value === null ? 0 : Number(value);
    if (!Number.isFinite(parsed)) throw invalid();
    return parsed;
  };
  const nullableNumber = (value: unknown): number | null => {
    if (value == null) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) throw invalid();
    return parsed;
  };
  if (!row.accountExternalId || !row.accountDisplayName) throw invalid();
  const baseMetrics = {
    views: number(row.views),
    likes: number(row.likes),
    comments: number(row.comments),
    shares: number(row.shares),
    watchTimeMinutes: number(row.watchTime),
    averageViewDurationSeconds: number(row.averageViewDuration),
  };
  const rawImpressions = row.impressions ?? (typeof row.rawMetrics.impressions === "number" ? row.rawMetrics.impressions : null);
  const impressions = rawImpressions != null ? nullableNumber(rawImpressions) : null;
  let ctr: number | null = null;
  if (row.ctr != null) {
    ctr = nullableNumber(row.ctr);
  } else if (typeof row.rawMetrics.ctr === "number") {
    ctr = nullableNumber(row.rawMetrics.ctr);
  }
  if (ctr == null && impressions != null && impressions > 0) {
    ctr = baseMetrics.views / impressions;
  }
  const estimatedRevenueRaw = row.estimatedRevenue ?? row.rawMetrics.estimatedRevenue;
  const cpmRaw = row.cpm ?? row.rawMetrics.cpm;
  const estimatedRevenue = estimatedRevenueRaw != null ? nullableNumber(estimatedRevenueRaw) : null;
  const cpm = cpmRaw != null ? nullableNumber(cpmRaw) : null;
  const averageViewPercentageRaw = row.rawMetrics.averageViewPercentage as number | null | undefined;
  const averageViewPercentage = averageViewPercentageRaw != null ? nullableNumber(averageViewPercentageRaw) : null;

  const metrics = {
    ...baseMetrics,
    impressions,
    ctr,
    estimatedRevenue,
    cpm,
  };

  const rawMetricType = row.rawMetrics.metricType as string | undefined;
  const hasRawDiscriminator = Object.hasOwn(row.rawMetrics, "metricType")
    || Object.hasOwn(row.rawMetrics, "metadataType");
  if (
    hasRawDiscriminator
    && (rawMetricType !== row.scopeType || row.rawMetrics.metadataType !== row.scopeType)
  ) throw invalid();
  const schema = rawMetricType ? DIMENSION_RAW_METRICS_SCHEMAS[rawMetricType as AnalyticsSnapshotScopeType] : null;
  const fetchedParsed = schema ? schema.safeParse(row.rawMetrics) : null;
  // Also try generic schema for unknown types: if rawMetrics has metricType but schema null, treat as invalid if discriminator present
  if (fetchedParsed && !fetchedParsed.success) throw invalid();
  const fetchedDate = fetchedParsed?.success ? new Date((fetchedParsed.data as unknown as { fetchedAt: string }).fetchedAt) : row.createdAt ?? row.dateUtc;
  if (!(fetchedDate instanceof Date) || !Number.isFinite(fetchedDate.getTime())) throw invalid();

  if (row.scopeType === "account") {
    if (row.scopeId !== row.accountId) throw invalid();
    return {
      id: row.id,
      platform: row.platform,
      accountId: row.accountId,
      scopeType: "account",
      scopeId: row.scopeId,
      dateJalali: row.dateJalali,
      dateUtc: row.dateUtc,
      fetchedAt: fetchedDate,
      ...metrics,
      channelId: row.accountExternalId,
      channelTitle: row.accountDisplayName,
      subscribersTotal: row.followersOrSubscribers,
      subscribersGained: number(row.subscribersGained),
      subscribersLost: number(row.subscribersLost),
    };
  }

  if (row.scopeType === "content") {
    const parsed = fetchedParsed?.success && (fetchedParsed.data as unknown as { metricType: string }).metricType === "content" ? fetchedParsed.data as unknown as { contentId: string | null; title: string; thumbnailUrl: string | null; publishedAt: string | null } : null;
    return {
      id: row.id,
      platform: row.platform,
      accountId: row.accountId,
      scopeType: "content",
      scopeId: row.scopeId,
      dateJalali: row.dateJalali,
      dateUtc: row.dateUtc,
      fetchedAt: fetchedDate,
      ...metrics,
      contentId: parsed?.contentId ?? null,
      videoId: row.scopeId,
      title: row.contentTitle ?? parsed?.title ?? "",
      thumbnailUrl: row.thumbnailUrl ?? parsed?.thumbnailUrl ?? null,
      publishedAt: row.publishedAt ?? (parsed?.publishedAt ? new Date(parsed.publishedAt) : null),
      channelId: row.accountExternalId,
      channelTitle: row.accountDisplayName,
    };
  }

  // For dimension types, channelId/channelTitle come from joined accountExternalId, but rawMetrics also has them
  const channelId = row.accountExternalId;
  const channelTitle = row.accountDisplayName;

  if (row.scopeType === "geo") {
    const parsed = fetchedParsed?.success ? fetchedParsed.data as unknown as { country: string } : null;
    const country = parsed?.country ?? (row.rawMetrics.country as string) ?? row.scopeId;
    if (typeof country !== "string" || country.length === 0) throw invalid();
    return {
      id: row.id,
      platform: row.platform,
      accountId: row.accountId,
      scopeType: "geo",
      scopeId: row.scopeId,
      dateJalali: row.dateJalali,
      dateUtc: row.dateUtc,
      fetchedAt: fetchedDate,
      ...metrics,
      channelId,
      channelTitle,
      country,
    };
  }

  if (row.scopeType === "age_gender") {
    const parsed = fetchedParsed?.success ? fetchedParsed.data as unknown as { ageGroup: string; gender: string } : null;
    let ageGroup = parsed?.ageGroup ?? (row.rawMetrics.ageGroup as string);
    let gender = parsed?.gender ?? (row.rawMetrics.gender as string);
    // Fallback: parse scopeId ageGroup:gender
    if ((!ageGroup || !gender) && typeof row.scopeId === "string" && row.scopeId.includes(":")) {
      const [ag, g] = row.scopeId.split(":");
      ageGroup = ageGroup ?? ag;
      gender = gender ?? g;
    }
    if (typeof ageGroup !== "string" || typeof gender !== "string") throw invalid();
    return {
      id: row.id,
      platform: row.platform,
      accountId: row.accountId,
      scopeType: "age_gender",
      scopeId: row.scopeId,
      dateJalali: row.dateJalali,
      dateUtc: row.dateUtc,
      fetchedAt: fetchedDate,
      ...metrics,
      channelId,
      channelTitle,
      ageGroup,
      gender,
    };
  }

  if (row.scopeType === "device") {
    const parsed = fetchedParsed?.success ? fetchedParsed.data as unknown as { deviceType: string } : null;
    const deviceType = parsed?.deviceType ?? (row.rawMetrics.deviceType as string) ?? row.scopeId;
    if (typeof deviceType !== "string" || deviceType.length === 0) throw invalid();
    return {
      id: row.id,
      platform: row.platform,
      accountId: row.accountId,
      scopeType: "device",
      scopeId: row.scopeId,
      dateJalali: row.dateJalali,
      dateUtc: row.dateUtc,
      fetchedAt: fetchedDate,
      ...metrics,
      channelId,
      channelTitle,
      deviceType,
    };
  }

  if (row.scopeType === "traffic") {
    const parsed = fetchedParsed?.success ? fetchedParsed.data as unknown as { trafficSource: string } : null;
    const trafficSource = parsed?.trafficSource ?? (row.rawMetrics.trafficSource as string) ?? (row.rawMetrics.insightTrafficSourceType as string) ?? row.scopeId;
    if (typeof trafficSource !== "string" || trafficSource.length === 0) throw invalid();
    return {
      id: row.id,
      platform: row.platform,
      accountId: row.accountId,
      scopeType: "traffic",
      scopeId: row.scopeId,
      dateJalali: row.dateJalali,
      dateUtc: row.dateUtc,
      fetchedAt: fetchedDate,
      ...metrics,
      channelId,
      channelTitle,
      trafficSource,
    };
  }

  if (row.scopeType === "search") {
    const parsed = fetchedParsed?.success ? fetchedParsed.data as unknown as { keyword: string } : null;
    const keyword = parsed?.keyword ?? (row.rawMetrics.keyword as string) ?? row.scopeId;
    if (typeof keyword !== "string" || keyword.length === 0) throw invalid();
    return {
      id: row.id,
      platform: row.platform,
      accountId: row.accountId,
      scopeType: "search",
      scopeId: row.scopeId,
      dateJalali: row.dateJalali,
      dateUtc: row.dateUtc,
      fetchedAt: fetchedDate,
      ...metrics,
      channelId,
      channelTitle,
      keyword,
    };
  }

  if (row.scopeType === "retention") {
    const parsed = fetchedParsed?.success ? fetchedParsed.data as unknown as { videoId: string } : null;
    const videoId = parsed?.videoId ?? (row.rawMetrics.videoId as string) ?? row.scopeId;
    if (typeof videoId !== "string" || videoId.length === 0) throw invalid();
    return {
      id: row.id,
      platform: row.platform,
      accountId: row.accountId,
      scopeType: "retention",
      scopeId: row.scopeId,
      dateJalali: row.dateJalali,
      dateUtc: row.dateUtc,
      fetchedAt: fetchedDate,
      ...metrics,
      channelId,
      channelTitle,
      videoId,
      averageViewPercentage,
    };
  }

  throw invalid();
}

function createDrizzleAnalyticsDatabasePort(): AnalyticsDatabasePort {
  return {
    async acquireLease(accountId, lockId, now, staleBefore) {
      const { db } = await import("@/db");
      const acquired = await db
        .update(socialAccounts)
        .set({ analyticsSyncLockId: lockId, analyticsSyncLockedAt: now })
        .where(buildAcquireLeaseCondition(accountId, staleBefore))
        .returning({ id: socialAccounts.id });
      return acquired.length === 1;
    },

    async releaseLease(accountId, lockId) {
      const { db } = await import("@/db");
      await db
        .update(socialAccounts)
        .set({ analyticsSyncLockId: null, analyticsSyncLockedAt: null })
        .where(buildReleaseLeaseCondition(accountId, lockId));
    },

    async upsertSnapshotChunk(rows) {
      if (rows.length === 0) return 0;
      const { db } = await import("@/db");
      const processed = await db
        .insert(analyticsSnapshots)
        .values([...rows])
        .onConflictDoUpdate({
          target: ANALYTICS_SNAPSHOT_CONFLICT_TARGET,
          set: {
            contentTitle: sql`excluded.content_title`,
            thumbnailUrl: sql`excluded.thumbnail_url`,
            publishedAt: sql`excluded.published_at`,
            dateJalali: sql`excluded.date_jalali`,
            followersOrSubscribers: sql`excluded.followers_or_subscribers`,
            subscribersGained: sql`excluded.subscribers_gained`,
            subscribersLost: sql`excluded.subscribers_lost`,
            views: sql`excluded.views`,
            likes: sql`excluded.likes`,
            comments: sql`excluded.comments`,
            shares: sql`excluded.shares`,
            watchTime: sql`excluded.watch_time`,
            averageViewDuration: sql`excluded.average_view_duration`,
            impressions: sql`excluded.impressions`,
            ctr: sql`excluded.ctr`,
            estimatedRevenue: sql`excluded.estimated_revenue`,
            cpm: sql`excluded.cpm`,
            rawMetrics: sql`excluded.raw_metrics`,
          },
        })
        .returning({ id: analyticsSnapshots.id });
      return processed.length;
    },

    async commitSync(accountId, lockId, syncedAt, syncedThrough, chunks) {
      const { db } = await import("@/db");
      return db.transaction(async (transaction) => {
        let processedCount = 0;
        for (const rows of chunks) {
          if (rows.length === 0) continue;
          const processed = await transaction
            .insert(analyticsSnapshots)
            .values([...rows])
            .onConflictDoUpdate({
              target: ANALYTICS_SNAPSHOT_CONFLICT_TARGET,
              set: {
                contentTitle: sql`excluded.content_title`,
                thumbnailUrl: sql`excluded.thumbnail_url`,
                publishedAt: sql`excluded.published_at`,
                dateJalali: sql`excluded.date_jalali`,
                followersOrSubscribers: sql`excluded.followers_or_subscribers`,
                subscribersGained: sql`excluded.subscribers_gained`,
                subscribersLost: sql`excluded.subscribers_lost`,
                views: sql`excluded.views`,
                likes: sql`excluded.likes`,
                comments: sql`excluded.comments`,
                shares: sql`excluded.shares`,
                watchTime: sql`excluded.watch_time`,
                averageViewDuration: sql`excluded.average_view_duration`,
                impressions: sql`excluded.impressions`,
                ctr: sql`excluded.ctr`,
                estimatedRevenue: sql`excluded.estimated_revenue`,
                cpm: sql`excluded.cpm`,
                rawMetrics: sql`excluded.raw_metrics`,
              },
            })
            .returning({ id: analyticsSnapshots.id });
          processedCount += processed.length;
        }

        const fenced = await transaction
          .update(socialAccounts)
          .set({
            lastSyncAt: syncedAt,
            lastError: null,
            analyticsLastErrorCode: null,
            analyticsNextAttemptAt: null,
            analyticsSyncedThrough: syncedThrough,
          })
          .where(buildReleaseLeaseCondition(accountId, lockId))
          .returning({ id: socialAccounts.id });
        if (fenced.length !== 1) throw new Error("Analytics lease lost");
        return processedCount;
      });
    },

    async getAnalyticsSyncedThrough(accountId) {
      const { db } = await import("@/db");
      const [latest] = await db
        .select({ syncedThrough: socialAccounts.analyticsSyncedThrough })
        .from(socialAccounts)
        .where(eq(socialAccounts.id, accountId))
        .limit(1);
      return latest?.syncedThrough ?? null;
    },

    async listAccountCandidates(accountIds) {
      const { db } = await import("@/db");
      const filters = [
        eq(socialAccounts.platform, "youtube"),
        eq(socialAccounts.active, true),
        eq(socialAccounts.connectionStatus, "connected"),
        isNotNull(socialAccounts.externalAccountId),
        isNotNull(socialAccounts.credentialRef),
        eq(credentials.provider, "youtube"),
      ];
      if (accountIds) filters.push(inArray(socialAccounts.id, accountIds));

      return db
        .select({
          id: socialAccounts.id,
          platform: socialAccounts.platform,
          externalAccountId: socialAccounts.externalAccountId,
          displayName: socialAccounts.displayName,
          active: socialAccounts.active,
          connectionStatus: socialAccounts.connectionStatus,
          credentialRef: socialAccounts.credentialRef,
          credentialProvider: credentials.provider,
          encryptedCredential: credentials.encryptedPayload,
          lastSyncAt: socialAccounts.lastSyncAt,
        })
        .from(socialAccounts)
        .innerJoin(credentials, eq(socialAccounts.credentialRef, credentials.id))
        .where(and(...filters));
    },

    async markSyncSuccess(accountId, syncedAt) {
      const { db } = await import("@/db");
      await db
        .update(socialAccounts)
        .set({
          lastSyncAt: syncedAt,
          lastError: null,
          analyticsLastErrorCode: null,
          analyticsNextAttemptAt: null,
        })
        .where(eq(socialAccounts.id, accountId));
    },

    async markSyncFailure(accountId, lockId, error, code, nextAttemptAt) {
      const { db } = await import("@/db");
      await db
        .update(socialAccounts)
        .set({
          lastError: error,
          analyticsLastErrorCode: code,
          analyticsNextAttemptAt: nextAttemptAt,
        })
        .where(lockId ? buildReleaseLeaseCondition(accountId, lockId) : eq(socialAccounts.id, accountId));
    },

    async readSnapshots(filter) {
      const { db } = await import("@/db");
      const rows = await db
        .select({
          id: analyticsSnapshots.id,
          platform: analyticsSnapshots.platform,
          accountId: analyticsSnapshots.accountId,
          scopeType: analyticsSnapshots.scopeType,
          scopeId: analyticsSnapshots.scopeId,
          dateJalali: analyticsSnapshots.dateJalali,
          dateUtc: analyticsSnapshots.dateUtc,
          createdAt: analyticsSnapshots.createdAt,
          accountExternalId: socialAccounts.externalAccountId,
          accountDisplayName: socialAccounts.displayName,
          contentTitle: analyticsSnapshots.contentTitle,
          thumbnailUrl: analyticsSnapshots.thumbnailUrl,
          publishedAt: analyticsSnapshots.publishedAt,
          followersOrSubscribers: analyticsSnapshots.followersOrSubscribers,
          subscribersGained: analyticsSnapshots.subscribersGained,
          subscribersLost: analyticsSnapshots.subscribersLost,
          views: analyticsSnapshots.views,
          likes: analyticsSnapshots.likes,
          comments: analyticsSnapshots.comments,
          shares: analyticsSnapshots.shares,
          watchTime: analyticsSnapshots.watchTime,
          averageViewDuration: analyticsSnapshots.averageViewDuration,
          impressions: analyticsSnapshots.impressions,
          ctr: analyticsSnapshots.ctr,
          estimatedRevenue: analyticsSnapshots.estimatedRevenue,
          cpm: analyticsSnapshots.cpm,
          rawMetrics: analyticsSnapshots.rawMetrics,
        })
        .from(analyticsSnapshots)
        .innerJoin(socialAccounts, eq(analyticsSnapshots.accountId, socialAccounts.id))
        .where(buildSnapshotFilterCondition(filter))
        .orderBy(asc(analyticsSnapshots.dateUtc));
      return rows;
    },

    async readAccountStatuses(accountIds) {
      if (accountIds?.length === 0) return [];
      const { db } = await import("@/db");
      const filters = [eq(socialAccounts.platform, "youtube")];
      if (accountIds) filters.push(inArray(socialAccounts.id, accountIds));
      return db
        .select({
          accountId: socialAccounts.id,
          lastSyncAt: socialAccounts.lastSyncAt,
          lastError: socialAccounts.lastError,
          lastErrorCode: socialAccounts.analyticsLastErrorCode,
          nextAttemptAt: socialAccounts.analyticsNextAttemptAt,
        })
        .from(socialAccounts)
        .where(and(...filters));
    },

    async aggregateContentByAccount(input) {
      const { db } = await import("@/db");
      const result = await db.execute(sql`
        select
          count(*)::int as video_count,
          coalesce(avg(video_views), 0)::float8 as views,
          coalesce(avg(video_likes), 0)::float8 as likes,
          coalesce(avg(video_comments), 0)::float8 as comments,
          coalesce(avg(video_shares), 0)::float8 as shares,
          coalesce(avg(video_watch_time), 0)::float8 as watch_time_minutes,
          coalesce(avg(video_average_duration), 0)::float8 as average_view_duration_seconds
        from (
          select
            ${analyticsSnapshots.scopeId},
            sum(${analyticsSnapshots.views})::float8 as video_views,
            sum(${analyticsSnapshots.likes})::float8 as video_likes,
            sum(${analyticsSnapshots.comments})::float8 as video_comments,
            sum(${analyticsSnapshots.shares})::float8 as video_shares,
            sum(${analyticsSnapshots.watchTime})::float8 as video_watch_time,
            case when sum(${analyticsSnapshots.views}) = 0 then 0
              else sum(${analyticsSnapshots.averageViewDuration}::numeric * ${analyticsSnapshots.views}) / sum(${analyticsSnapshots.views})
            end::float8 as video_average_duration
          from ${analyticsSnapshots}
          where ${analyticsSnapshots.platform} = 'youtube'
            and ${analyticsSnapshots.accountId} = ${input.accountId}
            and ${analyticsSnapshots.scopeType} = 'content'
            and ${analyticsSnapshots.dateUtc} >= ${input.startDateInclusive}
            and ${analyticsSnapshots.dateUtc} < ${input.endDateExclusive}
          group by ${analyticsSnapshots.scopeId}
        ) content_totals
      `);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      const numeric = (key: string) => Number(row?.[key] ?? 0);
      return {
        views: numeric("views"),
        likes: numeric("likes"),
        comments: numeric("comments"),
        shares: numeric("shares"),
        watchTimeMinutes: numeric("watch_time_minutes"),
        averageViewDurationSeconds: numeric("average_view_duration_seconds"),
        videoCount: numeric("video_count"),
      };
    },
  };
}

export function createAnalyticsRepository(
  databasePort: AnalyticsDatabasePort = createDrizzleAnalyticsDatabasePort(),
): AnalyticsRepository {
  return {
    acquireLease(accountId, lockId, now) {
      return databasePort.acquireLease(
        accountId,
        lockId,
        now,
        new Date(now.getTime() - LEASE_DURATION_MS),
      );
    },

    releaseLease(accountId, lockId) {
      return databasePort.releaseLease(accountId, lockId);
    },

    async upsertSnapshots(rows) {
      let processed = 0;
      for (const chunk of prepareSnapshotChunks(rows)) {
        processed += await databasePort.upsertSnapshotChunk(chunk);
      }
      return processed;
    },

    commitSync(accountId, lockId, syncedAt, syncedThrough, rows) {
      return databasePort.commitSync(
        accountId,
        lockId,
        syncedAt,
        syncedThrough,
        prepareSnapshotChunks(rows),
      );
    },

    getAnalyticsSyncedThrough(accountId) {
      return databasePort.getAnalyticsSyncedThrough(accountId);
    },

    async listSyncableAccounts(accountIds) {
      if (accountIds?.length === 0) return [];
      const candidates = await databasePort.listAccountCandidates(accountIds);
      const requestedIds = accountIds ? new Set(accountIds) : null;
      return candidates
        .filter(
          (account): account is AnalyticsAccountCandidate & {
            externalAccountId: string;
            credentialRef: string;
            encryptedCredential: string;
          } =>
            (!requestedIds || requestedIds.has(account.id)) &&
            account.platform === "youtube" &&
            account.active &&
            account.connectionStatus === "connected" &&
            account.externalAccountId !== null &&
            account.credentialRef !== null &&
            account.credentialProvider === "youtube" &&
            account.encryptedCredential !== null,
        )
        .map((account) => ({
          id: account.id,
          externalAccountId: account.externalAccountId,
          displayName: account.displayName,
          encryptedCredential: account.encryptedCredential,
          lastSyncAt: account.lastSyncAt,
        }));
    },

    markSyncSuccess(accountId, syncedAt) {
      return databasePort.markSyncSuccess(accountId, syncedAt);
    },

    markSyncFailure(accountId, lockId, error, code, nextAttemptAt) {
      return databasePort.markSyncFailure(accountId, lockId, error, code, nextAttemptAt);
    },

    async readSnapshots(filter) {
      if (filter.accountIds?.length === 0) return [];
      const rows = await databasePort.readSnapshots(filter);
      return rows.map(parseSnapshotRecord);
    },

    readAccountStatuses(accountIds) {
      if (accountIds?.length === 0 || !databasePort.readAccountStatuses) return Promise.resolve([]);
      return databasePort.readAccountStatuses(accountIds);
    },

    aggregateContentByAccount(input) {
      return databasePort.aggregateContentByAccount(input);
    },
  };
}

export const analyticsRepository: AnalyticsRepository = createAnalyticsRepository();
