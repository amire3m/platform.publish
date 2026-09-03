import { google } from "googleapis";
import type { Credentials } from "google-auth-library";
import { DateTime } from "luxon";

import type {
  AccountDailyMetric,
  AnalyticsFetchInput,
  ContentDailyMetric,
  DailyMetric,
} from "@/lib/analytics/types";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";

const CORE_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
  "averageViewPercentage",
].join(",");
const CONTENT_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "likes",
  "comments",
  "shares",
  "averageViewPercentage",
].join(",");
const REVENUE_METRICS = ["estimatedRevenue", "cpm", "adImpressions"].join(",");
const METRICS = CORE_METRICS;
const CONTENT_PAGE_SIZE = 200;
/**
 * Dimension-scoped reports (day,country / day,trafficSource / day,video …) only
 * accept engagement-lite metric sets for most channels — engagement metrics
 * (likes/comments/shares) yield "query is not supported" there.
 */
const DIMENSION_METRICS = ["views", "estimatedMinutesWatched", "averageViewDuration"].join(",");

export type RowMapper<T> = (
  row: Readonly<Record<string, unknown>>,
  rowIndex: number,
) => T;

export interface GeoDailyMetric extends DailyMetric {
  accountId: string;
  channelId: string;
  channelTitle: string;
  country: string;
  impressions: number | null;
  averageViewPercentage: number | null;
  estimatedRevenue: number | null;
  cpm: number | null;
  adImpressions: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface AgeGenderDailyMetric extends DailyMetric {
  accountId: string;
  channelId: string;
  channelTitle: string;
  ageGroup: string;
  gender: string;
  impressions: number | null;
  averageViewPercentage: number | null;
  estimatedRevenue: number | null;
  cpm: number | null;
  adImpressions: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface DeviceDailyMetric extends DailyMetric {
  accountId: string;
  channelId: string;
  channelTitle: string;
  deviceType: string;
  impressions: number | null;
  averageViewPercentage: number | null;
  estimatedRevenue: number | null;
  cpm: number | null;
  adImpressions: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface TrafficDailyMetric extends DailyMetric {
  accountId: string;
  channelId: string;
  channelTitle: string;
  trafficSource: string;
  impressions: number | null;
  averageViewPercentage: number | null;
  estimatedRevenue: number | null;
  cpm: number | null;
  adImpressions: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface SearchDailyMetric extends DailyMetric {
  accountId: string;
  channelId: string;
  channelTitle: string;
  keyword: string;
  impressions: number | null;
  averageViewPercentage: number | null;
  estimatedRevenue: number | null;
  cpm: number | null;
  adImpressions: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface RetentionDailyMetric extends DailyMetric {
  accountId: string;
  channelId: string;
  channelTitle: string;
  videoId: string;
  averageViewPercentage: number | null;
  impressions: number | null;
  estimatedRevenue: number | null;
  cpm: number | null;
  adImpressions: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface RevenueDailyMetric extends DailyMetric {
  accountId: string;
  channelId: string;
  channelTitle: string;
  impressions: number | null;
  averageViewPercentage: number | null;
  estimatedRevenue: number | null;
  cpm: number | null;
  adImpressions: number | null;
  subscribersGained: number;
  subscribersLost: number;
}

export interface YouTubeAnalyticsAdapter {
  fetchAccountDaily(input: AnalyticsFetchInput): Promise<AccountDailyMetric[]>;
  fetchContentDaily(input: AnalyticsFetchInput): Promise<ContentDailyMetric[]>;
  fetchGeoDaily?(input: AnalyticsFetchInput): Promise<GeoDailyMetric[]>;
  fetchAgeGenderDaily?(input: AnalyticsFetchInput): Promise<AgeGenderDailyMetric[]>;
  fetchDeviceDaily?(input: AnalyticsFetchInput): Promise<DeviceDailyMetric[]>;
  fetchTrafficDaily?(input: AnalyticsFetchInput): Promise<TrafficDailyMetric[]>;
  fetchSearchDaily?(input: AnalyticsFetchInput): Promise<SearchDailyMetric[]>;
  fetchRetentionDaily?(input: AnalyticsFetchInput): Promise<RetentionDailyMetric[]>;
  fetchRevenueDaily?(input: AnalyticsFetchInput): Promise<RevenueDailyMetric[]>;
}

export class AnalyticsResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsResponseError";
  }
}

type GoogleAnalyticsErrorClassification =
  | "retryable"
  | "reconnect_required"
  | "api_not_enabled"
  | "quota_exhausted"
  | "unsupported_query"
  | "permanent";

export class YouTubeAnalyticsApiError extends Error {
  readonly classification: GoogleAnalyticsErrorClassification;

  constructor(classification: GoogleAnalyticsErrorClassification) {
    super(`YouTube Analytics request failed (${classification})`);
    this.name = "YouTubeAnalyticsApiError";
    this.classification = classification;
  }
}

interface AccountMappingContext {
  accountId: string;
  channelId: string;
  channelTitle: string;
  timezone: string;
}

interface VideoMetadata {
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(
  row: Readonly<Record<string, unknown>>,
  field: string,
  rowIndex: number,
): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new AnalyticsResponseError(`Invalid required field '${field}' at row ${rowIndex}`);
  }
  return value;
}

function requiredNumber(
  row: Readonly<Record<string, unknown>>,
  field: string,
  rowIndex: number,
): number {
  const value = row[field];
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(number)) {
    throw new AnalyticsResponseError(`Invalid required numeric field '${field}' at row ${rowIndex}`);
  }
  return number;
}

function optionalNumber(
  row: Readonly<Record<string, unknown>>,
  field: string,
): number | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return number;
}

function mapDimensionBase(
  row: Readonly<Record<string, unknown>>,
  rowIndex: number,
  timezone: string,
  channel: { channelId: string; channelTitle: string },
  accountId: string,
): DailyMetric & {
  accountId: string;
  channelId: string;
  channelTitle: string;
  impressions: number | null;
  averageViewPercentage: number | null;
  estimatedRevenue: number | null;
  cpm: number | null;
  adImpressions: number | null;
  subscribersGained: number;
  subscribersLost: number;
} {
  return {
    ...mapDailyMetric(row, rowIndex, timezone),
    accountId,
    channelId: channel.channelId,
    channelTitle: channel.channelTitle,
    impressions: optionalNumber(row, "impressions"),
    averageViewPercentage: optionalNumber(row, "averageViewPercentage"),
    estimatedRevenue: optionalNumber(row, "estimatedRevenue"),
    cpm: optionalNumber(row, "cpm"),
    adImpressions: optionalNumber(row, "adImpressions"),
    subscribersGained: optionalNumber(row, "subscribersGained") ?? 0,
    subscribersLost: optionalNumber(row, "subscribersLost") ?? 0,
  };
}

function parseAnalyticsDay(day: string, timezone: string, rowIndex: number): Date {
  const date = DateTime.fromFormat(day, "yyyy-MM-dd", { zone: timezone });
  if (!date.isValid) {
    throw new AnalyticsResponseError(`Invalid required field 'day' at row ${rowIndex}`);
  }
  return date.startOf("day").toJSDate();
}

function mapDailyMetric(
  row: Readonly<Record<string, unknown>>,
  rowIndex: number,
  timezone: string,
) {
  return {
    date: parseAnalyticsDay(requiredString(row, "day", rowIndex), timezone, rowIndex),
    views: requiredNumber(row, "views", rowIndex),
    // Engagement metrics are absent from dimension-scoped reports (DIMENSION_METRICS):
    likes: optionalNumber(row, "likes") ?? 0,
    comments: optionalNumber(row, "comments") ?? 0,
    shares: optionalNumber(row, "shares") ?? 0,
    watchTimeMinutes: requiredNumber(row, "estimatedMinutesWatched", rowIndex),
    averageViewDurationSeconds: requiredNumber(row, "averageViewDuration", rowIndex),
  };
}

export function mapAnalyticsRows<T>(
  headers: string[],
  rows: unknown[][] | null | undefined,
  mapper: RowMapper<T>,
): T[] {
  if (!rows) return [];
  return rows.map((values, rowIndex) => {
    const row: Record<string, unknown> = {};
    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = values[index];
    }
    return mapper(row, rowIndex);
  });
}

export function mapAccountAnalyticsRows(
  headers: string[],
  rows: unknown[][] | null | undefined,
  context: AccountMappingContext,
): AccountDailyMetric[] {
  return mapAnalyticsRows(headers, rows, (row, rowIndex) => ({
    ...mapDailyMetric(row, rowIndex, context.timezone),
    accountId: context.accountId,
    channelId: context.channelId,
    channelTitle: context.channelTitle,
    subscribersTotal: null,
    subscribersGained: requiredNumber(row, "subscribersGained", rowIndex),
    subscribersLost: requiredNumber(row, "subscribersLost", rowIndex),
  }));
}

export function toGoogleDateRange(
  input: Pick<AnalyticsFetchInput, "startDate" | "endDate" | "timezone">,
) {
  const start = DateTime.fromJSDate(input.startDate, { zone: input.timezone });
  const end = DateTime.fromJSDate(input.endDate, { zone: input.timezone });
  if (!start.isValid || !end.isValid) {
    throw new AnalyticsResponseError("Invalid analytics date range or timezone");
  }
  return {
    startDate: start.toFormat("yyyy-MM-dd"),
    endDate: end.minus({ days: 1 }).toFormat("yyyy-MM-dd"),
  };
}

function responseHeaders(data: unknown): string[] {
  const columnHeaders = asRecord(data)?.columnHeaders;
  if (!Array.isArray(columnHeaders)) return [];
  return columnHeaders.map((header, index) => {
    const name = asRecord(header)?.name;
    if (typeof name !== "string") {
      throw new AnalyticsResponseError(`Invalid analytics header at index ${index}`);
    }
    return name;
  });
}

function responseRows(data: unknown): unknown[][] | null | undefined {
  const rows = asRecord(data)?.rows;
  if (rows === null || rows === undefined) return rows;
  if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row))) {
    throw new AnalyticsResponseError("Invalid analytics rows");
  }
  return rows as unknown[][];
}

function errorStatus(error: unknown): number | null {
  const record = asRecord(error);
  const response = asRecord(record?.response);
  const status = record?.status ?? response?.status ?? record?.code;
  if (typeof status === "number") return status;
  if (typeof status === "string" && /^\d+$/.test(status)) return Number(status);
  return null;
}

function errorReasons(error: unknown): string[] {
  const reasons: string[] = [];
  const collect = (rawError: unknown) => {
    if (typeof rawError === "string") {
      reasons.push(rawError);
      return;
    }
    const errorBody = asRecord(rawError);
    for (const field of ["error", "reason", "status", "code"] as const) {
      const value = errorBody?.[field];
      if (typeof value === "string") reasons.push(value);
    }
    for (const field of ["errors", "details"] as const) {
      const items = errorBody?.[field];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const reason = asRecord(item)?.reason;
        if (typeof reason === "string") reasons.push(reason);
      }
    }
  };
  const record = asRecord(error);
  const response = asRecord(asRecord(error)?.response);
  const responseData = asRecord(response?.data);
  collect(record?.error);
  collect(responseData?.error);
  return reasons;
}

export function classifyGoogleAnalyticsError(
  error: unknown,
): GoogleAnalyticsErrorClassification {
  const status = errorStatus(error);
  const reasons = errorReasons(error).map((reason) =>
    reason.toLowerCase().replace(/[^a-z0-9]/g, "")
  );
  if (reasons.some((reason) => ["accessnotconfigured", "servicedisabled"].includes(reason))) {
    return "api_not_enabled";
  }
  if (reasons.some((reason) => ["quotaexceeded", "dailylimitexceeded"].includes(reason))) {
    return "quota_exhausted";
  }
  if (
    status === 401
    || reasons.some((reason) => [
      "autherror",
      "invalidcredentials",
      "invalidgrant",
      "insufficientpermissions",
      "insufficientscope",
    ].includes(reason))
  ) {
    return "reconnect_required";
  }
  if (status === 429 || (status !== null && status >= 500 && status <= 599)) {
    return "retryable";
  }
  try {
    const raw = JSON.stringify(error).toLowerCase();
    if (raw.includes("query is not supported")) return "unsupported_query";
  } catch {}
  return "permanent";
}

async function callGoogleApi<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw new YouTubeAnalyticsApiError(classifyGoogleAnalyticsError(error));
  }
}

export function createYouTubeAnalyticsAdapter(tokens: Credentials): YouTubeAnalyticsAdapter {
  const auth = getGoogleOAuthClient();
  auth.setCredentials(tokens);
  const analytics = google.youtubeAnalytics({ version: "v2", auth });
  const youtube = google.youtube({ version: "v3", auth });

  async function fetchChannel() {
    const response = await callGoogleApi(() => youtube.channels.list({
      part: ["snippet", "statistics"],
      mine: true,
    }));
    const channel = response.data.items?.[0];
    if (!channel?.id || !channel.snippet?.title) {
      throw new AnalyticsResponseError("YouTube channel metadata is missing required fields");
    }
    const subscriberCount = channel.statistics?.subscriberCount;
    if (typeof subscriberCount === "string" && subscriberCount.trim() === "") {
      throw new AnalyticsResponseError("YouTube channel subscriber count is malformed");
    }
    const subscribersTotal = subscriberCount === null || subscriberCount === undefined
      ? null
      : Number(subscriberCount);
    if (subscribersTotal !== null && !Number.isFinite(subscribersTotal)) {
      throw new AnalyticsResponseError("YouTube channel subscriber count is malformed");
    }
    return {
      channelId: channel.id,
      channelTitle: channel.snippet.title,
      subscribersTotal,
    };
  }

  async function fetchVideoMetadata(videoIds: string[]): Promise<Map<string, VideoMetadata>> {
    const metadata = new Map<string, VideoMetadata>();
    for (let index = 0; index < videoIds.length; index += 50) {
      const response = await callGoogleApi(() => youtube.videos.list({
        part: ["snippet"],
        id: videoIds.slice(index, index + 50),
      }));
      for (const video of response.data.items ?? []) {
        if (!video.id) continue;
        const publishedAt = video.snippet?.publishedAt
          ? new Date(video.snippet.publishedAt)
          : null;
        metadata.set(video.id, {
          title: video.snippet?.title ?? "",
          thumbnailUrl:
            video.snippet?.thumbnails?.maxres?.url
            ?? video.snippet?.thumbnails?.high?.url
            ?? video.snippet?.thumbnails?.medium?.url
            ?? video.snippet?.thumbnails?.default?.url
            ?? null,
          publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt : null,
        });
      }
    }
    return metadata;
  }

  return {
    async fetchAccountDaily(input) {
      const channel = await fetchChannel();
      const dateRange = toGoogleDateRange(input);
      const response = await callGoogleApi(() => analytics.reports.query({
        ids: "channel==MINE",
        dimensions: "day",
        metrics: METRICS,
        ...dateRange,
      }));
      const rows = mapAccountAnalyticsRows(
        responseHeaders(response.data),
        responseRows(response.data),
        { ...channel, accountId: input.accountId, timezone: input.timezone },
      );
      const rowsByDay = new Map(rows.map((row) => [
        DateTime.fromJSDate(row.date, { zone: input.timezone }).toFormat("yyyy-MM-dd"),
        row,
      ]));
      const completedDays: AccountDailyMetric[] = [];
      for (
        let day = DateTime.fromJSDate(input.startDate, { zone: input.timezone }).startOf("day");
        day < DateTime.fromJSDate(input.endDate, { zone: input.timezone }).startOf("day");
        day = day.plus({ days: 1 })
      ) {
        completedDays.push(rowsByDay.get(day.toFormat("yyyy-MM-dd")) ?? {
          accountId: input.accountId,
          channelId: channel.channelId,
          channelTitle: channel.channelTitle,
          date: day.toJSDate(),
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          watchTimeMinutes: 0,
          averageViewDurationSeconds: 0,
          subscribersTotal: null,
          subscribersGained: 0,
          subscribersLost: 0,
        });
      }
      if (completedDays.length > 0) {
        completedDays[completedDays.length - 1].subscribersTotal = channel.subscribersTotal;
      }
      return completedDays;
    },

    async fetchContentDaily(input) {
      const channel = await fetchChannel();
      const dateRange = toGoogleDateRange(input);
      const mappedRows: Array<{
        metric: Omit<ContentDailyMetric, "contentId" | "videoId" | "title" | "thumbnailUrl" | "publishedAt">;
        videoId: string;
      }> = [];
      let startIndex = 1;
      while (true) {
        const response = await callGoogleApi(() => analytics.reports.query({
          ids: "channel==MINE",
          dimensions: "day,video",
          metrics: CONTENT_METRICS,
          startIndex,
          maxResults: CONTENT_PAGE_SIZE,
          ...dateRange,
        }));
        const rows = responseRows(response.data);
        const page = mapAnalyticsRows(responseHeaders(response.data), rows, (row, rowIndex) => ({
          metric: {
            ...mapDailyMetric(row, rowIndex, input.timezone),
            accountId: input.accountId,
            channelId: channel.channelId,
            channelTitle: channel.channelTitle,
          },
          videoId: requiredString(row, "video", rowIndex),
        }));
        mappedRows.push(...page);
        if (page.length < CONTENT_PAGE_SIZE) break;
        startIndex += page.length;
      }

      const videoIds = [...new Set(mappedRows.map((row) => row.videoId))];
      const metadata = await fetchVideoMetadata(videoIds);
      return mappedRows.map(({ metric, videoId }) => {
        const video = metadata.get(videoId);
        return {
          ...metric,
          contentId: null,
          videoId,
          title: video?.title ?? "",
          thumbnailUrl: video?.thumbnailUrl ?? null,
          publishedAt: video?.publishedAt ?? null,
        };
      });
    },

    async fetchGeoDaily(input) {
      const channel = await fetchChannel();
      const dateRange = toGoogleDateRange(input);
      const response = await callGoogleApi(() => analytics.reports.query({
        ids: "channel==MINE",
        dimensions: "day,country",
        metrics: DIMENSION_METRICS,
        ...dateRange,
      }));
      return mapAnalyticsRows(responseHeaders(response.data), responseRows(response.data), (row, rowIndex) => ({
        ...mapDimensionBase(row, rowIndex, input.timezone, channel, input.accountId),
        country: requiredString(row, "country", rowIndex),
      }));
    },

    async fetchAgeGenderDaily(input) {
      const channel = await fetchChannel();
      const dateRange = toGoogleDateRange(input);
      // YouTube rejects `day,ageGroup,gender` combinations outright ("query is not
      // supported"), but the aggregate (no day) form works. Fetch one row per
      // (ageGroup,gender) bucket covering the whole range, stamped with the range end.
      const response = await callGoogleApi(() => analytics.reports.query({
        ids: "channel==MINE",
        dimensions: "ageGroup,gender",
        metrics: "views",
        ...dateRange,
      }));
      const endDay = DateTime.fromJSDate(input.endDate, { zone: input.timezone }).startOf("day").toJSDate();
      return mapAnalyticsRows(responseHeaders(response.data), responseRows(response.data), (row, rowIndex) => ({
        accountId: input.accountId,
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        date: endDay,
        views: requiredNumber(row, "views", rowIndex),
        likes: 0,
        comments: 0,
        shares: 0,
        watchTimeMinutes: 0,
        averageViewDurationSeconds: 0,
        impressions: null,
        averageViewPercentage: null,
        estimatedRevenue: null,
        cpm: null,
        adImpressions: null,
        subscribersGained: 0,
        subscribersLost: 0,
        ageGroup: requiredString(row, "ageGroup", rowIndex),
        gender: requiredString(row, "gender", rowIndex),
      }));
    },

    async fetchDeviceDaily(input) {
      const channel = await fetchChannel();
      const dateRange = toGoogleDateRange(input);
      const response = await callGoogleApi(() => analytics.reports.query({
        ids: "channel==MINE",
        dimensions: "day,deviceType",
        metrics: DIMENSION_METRICS,
        ...dateRange,
      }));
      return mapAnalyticsRows(responseHeaders(response.data), responseRows(response.data), (row, rowIndex) => ({
        ...mapDimensionBase(row, rowIndex, input.timezone, channel, input.accountId),
        deviceType: requiredString(row, "deviceType", rowIndex),
      }));
    },

    async fetchTrafficDaily(input) {
      const channel = await fetchChannel();
      const dateRange = toGoogleDateRange(input);
      const response = await callGoogleApi(() => analytics.reports.query({
        ids: "channel==MINE",
        dimensions: "day,insightTrafficSourceType",
        metrics: DIMENSION_METRICS,
        ...dateRange,
      }));
      return mapAnalyticsRows(responseHeaders(response.data), responseRows(response.data), (row, rowIndex) => ({
        ...mapDimensionBase(row, rowIndex, input.timezone, channel, input.accountId),
        trafficSource: requiredString(row, "insightTrafficSourceType", rowIndex),
      }));
    },

    async fetchSearchDaily(input) {
      const channel = await fetchChannel();
      const dateRange = toGoogleDateRange(input);
      const response = await callGoogleApi(() => analytics.reports.query({
        ids: "channel==MINE",
        dimensions: "day,insightTrafficSourceDetail",
        metrics: DIMENSION_METRICS,
        filters: "insightTrafficSourceType==YT_SEARCH",
        ...dateRange,
      }));
      const rows = mapAnalyticsRows(responseHeaders(response.data), responseRows(response.data), (row, rowIndex) => ({
        ...mapDimensionBase(row, rowIndex, input.timezone, channel, input.accountId),
        keyword: requiredString(row, "insightTrafficSourceDetail", rowIndex),
      }));
      // Client-side filter fallback: if API ignores filters, keep only YT_SEARCH detail values (non-empty)
      return rows.filter((r) => r.keyword && r.keyword.length > 0);
    },

    async fetchRetentionDaily(input) {
      const channel = await fetchChannel();
      // True audience-retention curve: `day,video` reports are unsupported for most
      // channels, but `elapsedVideoTimeRatio + audienceWatchRatio` filtered per video
      // works. Fetch the top N uploads and return each video's average watch ratio.
      const yt = google.youtube({ version: "v3", auth });
      const uploads = await callGoogleApi(async (): Promise<string[]> => {
        const ch = (await yt.channels.list({ part: ["contentDetails"], mine: true })).data;
        const playlist = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (!playlist) return [];
        const items = (await yt.playlistItems.list({ part: ["contentDetails"], playlistId: playlist, maxResults: 20 })).data;
        return (items.items ?? [])
          .map((it) => it.contentDetails?.videoId ?? "")
          .filter((v) => typeof v === "string" && v.length > 0);
      });
      const results: RetentionDailyMetric[] = [];
      const rangeEnd = DateTime.fromJSDate(input.endDate, { zone: input.timezone }).startOf("day").toJSDate();
      const endDateStr = toGoogleDateRange(input).endDate as string;
      for (const videoId of uploads) {
        try {
          const resp = await callGoogleApi(() => analytics.reports.query({
            ids: "channel==MINE",
            startDate: "2006-01-01",
            endDate: endDateStr,
            dimensions: "elapsedVideoTimeRatio",
            metrics: "audienceWatchRatio",
            filters: `video==${videoId}`,
          }));
          const ratios = mapAnalyticsRows(
            responseHeaders(resp.data),
            responseRows(resp.data),
            (row) => optionalNumber(row, "audienceWatchRatio") ?? 0,
          );
          if (ratios.length === 0) continue;
          const averageRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
          results.push({
            date: rangeEnd,
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            watchTimeMinutes: 0,
            averageViewDurationSeconds: 0,
            accountId: input.accountId,
            channelId: channel.channelId,
            channelTitle: channel.channelTitle,
            videoId,
            averageViewPercentage: Math.round(averageRatio * 100),
            impressions: null,
            estimatedRevenue: null,
            cpm: null,
            adImpressions: null,
            subscribersGained: 0,
            subscribersLost: 0,
          });
        } catch {
          // unsupported for this video — skip it
        }
      }
      return results;
    },

    async fetchRevenueDaily(input) {
      const channel = await fetchChannel();
      const dateRange = toGoogleDateRange(input);
      try {
        const response = await callGoogleApi(() => analytics.reports.query({
          ids: "channel==MINE",
          dimensions: "day",
          metrics: `${CORE_METRICS},${REVENUE_METRICS}`,
          ...dateRange,
        }));
        return mapAnalyticsRows(responseHeaders(response.data), responseRows(response.data), (row, rowIndex) => ({
          ...mapDimensionBase(row, rowIndex, input.timezone, channel, input.accountId),
        }));
      } catch (error) {
        if (error instanceof YouTubeAnalyticsApiError && error.classification === "permanent") {
          // Non-monetized channels return permanent error for revenue metrics — treat as empty, not failure
          return [];
        }
        throw error;
      }
    },
  };
}
