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

export interface AnalyticsSnapshotFilter {
  accountIds?: readonly string[];
  scopeType?: "account" | "content";
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

export type AnalyticsSnapshotRecord =
  | AccountAnalyticsSnapshotRecord
  | ContentAnalyticsSnapshotRecord;

export interface AnalyticsSnapshotPersistenceRow {
  id: string;
  platform: "youtube";
  accountId: string;
  scopeType: "account" | "content";
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

const commonRawMetricsSchema = {
  views: z.number().finite(),
  likes: z.number().finite(),
  comments: z.number().finite(),
  shares: z.number().finite(),
  watchTimeMinutes: z.number().finite(),
  averageViewDurationSeconds: z.number().finite(),
  fetchedAt: z.string().datetime({ offset: true }),
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

function mapSnapshot(row: AnalyticsSnapshotInput): MappedSnapshotPersistenceRow {
  if (row.scopeType === "account" && row.scopeId !== row.accountId) {
    throw new Error("Account snapshot scopeId must match accountId");
  }

  const contentMetadata = row.scopeType === "content" ? row.metadata : null;
  const accountMetrics = row.scopeType === "account" ? row.metrics : null;
  const dateUtc = startOfTehranDayUtc(row.date);
  const rawMetrics = row.scopeType === "account"
    ? {
        metricType: row.metrics.metricType,
        views: row.metrics.views,
        likes: row.metrics.likes,
        comments: row.metrics.comments,
        shares: row.metrics.shares,
        watchTimeMinutes: row.metrics.watchTimeMinutes,
        averageViewDurationSeconds: row.metrics.averageViewDurationSeconds,
        subscribersTotal: row.metrics.subscribersTotal,
        subscribersGained: row.metrics.subscribersGained,
        subscribersLost: row.metrics.subscribersLost,
        metadataType: row.metadata.metadataType,
        channelId: row.metadata.channelId,
        channelTitle: row.metadata.channelTitle,
        fetchedAt: row.fetchedAt.toISOString(),
      }
    : {
        metricType: row.metrics.metricType,
        views: row.metrics.views,
        likes: row.metrics.likes,
        comments: row.metrics.comments,
        shares: row.metrics.shares,
        watchTimeMinutes: row.metrics.watchTimeMinutes,
        averageViewDurationSeconds: row.metrics.averageViewDurationSeconds,
        metadataType: row.metadata.metadataType,
        contentId: row.metadata.contentId,
        videoId: row.metadata.videoId,
        title: row.metadata.title,
        thumbnailUrl: row.metadata.thumbnailUrl,
        publishedAt: row.metadata.publishedAt?.toISOString() ?? null,
        channelId: row.metadata.channelId,
        channelTitle: row.metadata.channelTitle,
        fetchedAt: row.fetchedAt.toISOString(),
      };

  return {
    platform: row.platform,
    accountId: row.accountId,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    contentTitle: contentMetadata?.title ?? null,
    thumbnailUrl: contentMetadata?.thumbnailUrl ?? null,
    publishedAt: contentMetadata?.publishedAt ?? null,
    dateJalali: formatJalaliSlash(dateUtc).slice(0, 10),
    dateUtc,
    followersOrSubscribers: accountMetrics?.subscribersTotal ?? null,
    subscribersGained: accountMetrics?.subscribersGained ?? 0,
    subscribersLost: accountMetrics?.subscribersLost ?? 0,
    views: row.metrics.views,
    likes: row.metrics.likes,
    comments: row.metrics.comments,
    shares: row.metrics.shares,
    watchTime: row.metrics.watchTimeMinutes,
    averageViewDuration: String(row.metrics.averageViewDurationSeconds),
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

function parseSnapshotRecord(
  row: AnalyticsSnapshotDatabaseRow,
  index: number,
): AnalyticsSnapshotRecord {
  const invalid = () => new Error(`Invalid analytics snapshot record at index ${index}`);
  if (
    row.platform !== "youtube" ||
    (row.scopeType !== "account" && row.scopeType !== "content") ||
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
  if (!row.accountExternalId || !row.accountDisplayName) throw invalid();
  const metrics = {
    views: number(row.views),
    likes: number(row.likes),
    comments: number(row.comments),
    shares: number(row.shares),
    watchTimeMinutes: number(row.watchTime),
    averageViewDurationSeconds: number(row.averageViewDuration),
  };
  const rawMetricType = row.rawMetrics.metricType;
  const hasRawDiscriminator = Object.hasOwn(row.rawMetrics, "metricType")
    || Object.hasOwn(row.rawMetrics, "metadataType");
  if (
    hasRawDiscriminator
    && (rawMetricType !== row.scopeType || row.rawMetrics.metadataType !== row.scopeType)
  ) throw invalid();
  const fetchedAt = rawMetricType === "account"
    ? accountRawMetricsSchema.safeParse(row.rawMetrics)
    : rawMetricType === "content"
      ? contentRawMetricsSchema.safeParse(row.rawMetrics)
      : null;
  if (fetchedAt && !fetchedAt.success) throw invalid();
  const fetchedDate = fetchedAt?.success ? new Date(fetchedAt.data.fetchedAt) : row.createdAt ?? row.dateUtc;
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

  const parsed = fetchedAt?.success && fetchedAt.data.metricType === "content" ? fetchedAt.data : null;
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
