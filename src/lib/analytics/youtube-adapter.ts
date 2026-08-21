import { google } from "googleapis";
import type { Credentials } from "google-auth-library";
import { DateTime } from "luxon";

import type {
  AccountDailyMetric,
  AnalyticsFetchInput,
  ContentDailyMetric,
} from "@/lib/analytics/types";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";

const METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
].join(",");
const CONTENT_PAGE_SIZE = 200;

export type RowMapper<T> = (
  row: Readonly<Record<string, unknown>>,
  rowIndex: number,
) => T;

export interface YouTubeAnalyticsAdapter {
  fetchAccountDaily(input: AnalyticsFetchInput): Promise<AccountDailyMetric[]>;
  fetchContentDaily(input: AnalyticsFetchInput): Promise<ContentDailyMetric[]>;
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
    likes: requiredNumber(row, "likes", rowIndex),
    comments: requiredNumber(row, "comments", rowIndex),
    shares: requiredNumber(row, "shares", rowIndex),
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
      if (rows.length > 0) {
        const latest = rows.reduce((candidate, row) =>
          row.date > candidate.date ? row : candidate,
        );
        latest.subscribersTotal = channel.subscribersTotal;
      }
      return rows;
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
          metrics: METRICS,
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
  };
}
