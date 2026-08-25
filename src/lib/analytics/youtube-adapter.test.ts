import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Credentials } from "google-auth-library";

const mocks = vi.hoisted(() => ({
  analyticsQuery: vi.fn(),
  channelsList: vi.fn(),
  videosList: vi.fn(),
  setCredentials: vi.fn(),
  getGoogleOAuthClient: vi.fn(),
  youtubeAnalytics: vi.fn(),
  youtube: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    youtubeAnalytics: mocks.youtubeAnalytics,
    youtube: mocks.youtube,
  },
}));

vi.mock("@/lib/providers/youtube", () => ({
  getGoogleOAuthClient: mocks.getGoogleOAuthClient,
}));

import {
  AnalyticsResponseError,
  YouTubeAnalyticsApiError,
  classifyGoogleAnalyticsError,
  createYouTubeAnalyticsAdapter,
  mapAccountAnalyticsRows,
  mapAnalyticsRows,
  toGoogleDateRange,
} from "@/lib/analytics/youtube-adapter";

const headers = [
  "day",
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
  "averageViewPercentage",
];
const metrics = "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained,subscribersLost,averageViewPercentage";

function metricRow(day: string, views: string): unknown[] {
  return [day, views, "120", "30", "4", "3", "2", "5", "1", "45"];
}

function input() {
  return {
    accountId: "account-1",
    startDate: new Date("2026-08-18T20:30:00.000Z"),
    endDate: new Date("2026-08-21T20:30:00.000Z"),
    timezone: "Asia/Tehran",
  };
}

describe("response mapping", () => {
  it("maps values by reordered response headers instead of fixed positions", () => {
    const result = mapAnalyticsRows(
      ["likes", "day", "views"],
      [["7", "2026-08-20", "42"]],
      (row) => ({ day: row.day, views: row.views, likes: row.likes }),
    );

    expect(result).toEqual([{ day: "2026-08-20", views: "42", likes: "7" }]);
  });

  it("returns an empty array for nullish rows", () => {
    expect(mapAnalyticsRows(["day"], null, (row) => row.day)).toEqual([]);
    expect(mapAnalyticsRows(["day"], undefined, (row) => row.day)).toEqual([]);
  });

  it("converts numeric strings and rejects malformed required values without secrets", () => {
    const context = {
      accountId: "account-1",
      channelId: "channel-1",
      channelTitle: "Channel",
      timezone: "Asia/Tehran",
    };
    const mapped = mapAccountAnalyticsRows(headers, [metricRow("2026-08-20", "42")], context);

    expect(mapped[0]).toMatchObject({
      views: 42,
      watchTimeMinutes: 120,
      averageViewDurationSeconds: 30,
      subscribersGained: 5,
      subscribersLost: 1,
    });

    const secret = "sample-access-token-123";
    expect(() =>
      mapAccountAnalyticsRows(headers, [metricRow("2026-08-20", secret)], context),
    ).toThrow(AnalyticsResponseError);
    try {
      mapAccountAnalyticsRows(headers, [metricRow("2026-08-20", secret)], context);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe("date conversion", () => {
  it("converts an explicit Tehran half-open range to Google's inclusive dates", () => {
    expect(toGoogleDateRange(input())).toEqual({
      startDate: "2026-08-19",
      endDate: "2026-08-21",
    });
  });
});

describe("Google error classification", () => {
  it.each([
    [{ response: { status: 429 } }, "retryable"],
    [{ status: 503 }, "retryable"],
    [{ error: "invalid_grant" }, "reconnect_required"],
    [{ response: { status: 400, data: { error: "invalid_grant" } } }, "reconnect_required"],
    [{ response: { status: 403, data: { error: { code: "insufficient_scope" } } } }, "reconnect_required"],
    [{ response: { status: 401, data: { error: { errors: [{ reason: "authError" }] } } } }, "reconnect_required"],
    [{ response: { status: 403, data: { error: { errors: [{ reason: "accessNotConfigured" }] } } } }, "api_not_enabled"],
    [{
      status: 503,
      response: {
        status: 503,
        data: {
          error: {
            code: 503,
            status: "UNAVAILABLE",
            details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "SERVICE_DISABLED" }],
          },
        },
      },
    }, "api_not_enabled"],
    [{ response: { status: 403, data: { error: { errors: [{ reason: "quotaExceeded" }] } } } }, "quota_exhausted"],
    [{
      response: {
        status: 503,
        data: { error: { details: [{ reason: "DAILY_LIMIT_EXCEEDED" }] } },
      },
    }, "quota_exhausted"],
    [{ response: { status: 400, data: { error: { errors: [{ reason: "badRequest" }] } } } }, "permanent"],
  ] as const)("classifies %# without exposing error details", (error, expected) => {
    expect(classifyGoogleAnalyticsError(error)).toBe(expected);
  });
});

describe("YouTubeAnalyticsAdapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getGoogleOAuthClient.mockImplementation(() => ({
      setCredentials: mocks.setCredentials,
    }));
    mocks.youtubeAnalytics.mockReturnValue({ reports: { query: mocks.analyticsQuery } });
    mocks.youtube.mockReturnValue({
      channels: { list: mocks.channelsList },
      videos: { list: mocks.videosList },
    });
    mocks.analyticsQuery.mockResolvedValue({
      data: {
        columnHeaders: headers.map((name) => ({ name, columnType: "METRIC", dataType: "INTEGER" })),
        rows: null,
      },
    });
    mocks.channelsList.mockResolvedValue({
      data: {
        items: [{
          id: "channel-1",
          snippet: { title: "Channel" },
          statistics: { subscriberCount: "1234" },
        }],
      },
    });
    mocks.videosList.mockResolvedValue({ data: { items: [] } });
  });

  it("sets credentials and places current subscribers only on the latest account row", async () => {
    mocks.analyticsQuery.mockResolvedValue({
      data: {
        columnHeaders: headers.map((name) => ({ name, columnType: "METRIC", dataType: "INTEGER" })),
        rows: [metricRow("2026-08-19", "10"), metricRow("2026-08-21", "30"), metricRow("2026-08-20", "20")],
      },
    });
    const tokens: Credentials = { access_token: "sample-access-token-123" };

    const result = await createYouTubeAnalyticsAdapter(tokens).fetchAccountDaily(input());

    expect(mocks.setCredentials).toHaveBeenCalledWith(tokens);
    expect(result.map((row) => [row.date.toISOString(), row.subscribersTotal])).toEqual([
      ["2026-08-18T20:30:00.000Z", null],
      ["2026-08-19T20:30:00.000Z", null],
      ["2026-08-20T20:30:00.000Z", 1234],
    ]);
    expect(mocks.analyticsQuery).toHaveBeenCalledWith({
      ids: "channel==MINE",
      dimensions: "day",
      metrics,
      startDate: "2026-08-19",
      endDate: "2026-08-21",
    });
    expect(mocks.channelsList).toHaveBeenCalledWith({
      part: ["snippet", "statistics"],
      mine: true,
    });
  });

  it("synthesizes missing and trailing account days and puts subscribers on the latest completed day", async () => {
    mocks.analyticsQuery.mockResolvedValue({
      data: {
        columnHeaders: headers.map((name) => ({ name })),
        rows: [metricRow("2026-08-20", "10")],
      },
    });

    const result = await createYouTubeAnalyticsAdapter({}).fetchAccountDaily(input());

    expect(result.map((item) => ({
      day: item.date.toISOString(),
      views: item.views,
      subscribersTotal: item.subscribersTotal,
    }))).toEqual([
      { day: "2026-08-18T20:30:00.000Z", views: 0, subscribersTotal: null },
      { day: "2026-08-19T20:30:00.000Z", views: 10, subscribersTotal: null },
      { day: "2026-08-20T20:30:00.000Z", views: 0, subscribersTotal: 1234 },
    ]);
  });

  it("isolates credentials and auth clients between adapter instances", () => {
    const firstAuth = { setCredentials: vi.fn() };
    const secondAuth = { setCredentials: vi.fn() };
    mocks.getGoogleOAuthClient
      .mockReturnValueOnce(firstAuth)
      .mockReturnValueOnce(secondAuth);

    createYouTubeAnalyticsAdapter({ access_token: "first-token" });
    createYouTubeAnalyticsAdapter({ access_token: "second-token" });

    expect(firstAuth.setCredentials).toHaveBeenCalledWith({ access_token: "first-token" });
    expect(secondAuth.setCredentials).toHaveBeenCalledWith({ access_token: "second-token" });
    expect(mocks.youtubeAnalytics.mock.calls.map(([options]) => options)).toEqual([
      { version: "v2", auth: firstAuth },
      { version: "v2", auth: secondAuth },
    ]);
    expect(mocks.youtube.mock.calls.map(([options]) => options)).toEqual([
      { version: "v3", auth: firstAuth },
      { version: "v3", auth: secondAuth },
    ]);
  });

  it("sanitizes Google API failures while preserving their classification", async () => {
    const secret = "sample-access-token-123";
    mocks.analyticsQuery.mockRejectedValue(Object.assign(new Error(secret), {
      response: { status: 503 },
    }));

    const request = createYouTubeAnalyticsAdapter({ access_token: secret })
      .fetchAccountDaily(input());

    await expect(request).rejects.toMatchObject({
      name: "YouTubeAnalyticsApiError",
      classification: "retryable",
    });
    try {
      await request;
    } catch (error) {
      expect(error).toBeInstanceOf(YouTubeAnalyticsApiError);
      expect(String(error)).not.toContain(secret);
    }
  });

  it("rejects a whitespace-only channel subscriber count", async () => {
    mocks.channelsList.mockResolvedValue({
      data: {
        items: [{
          id: "channel-1",
          snippet: { title: "Channel" },
          statistics: { subscriberCount: "   " },
        }],
      },
    });

    await expect(
      createYouTubeAnalyticsAdapter({}).fetchAccountDaily(input()),
    ).rejects.toThrow(AnalyticsResponseError);
  });

  it("batches video metadata at 50 IDs and safely handles missing metadata", async () => {
    const videoHeaders = [...headers, "video"];
    const rows = Array.from({ length: 51 }, (_, index) => [
      ...metricRow("2026-08-20", String(index + 1)),
      `video-${index + 1}`,
    ]);
    rows.push([...metricRow("2026-08-20", "52"), "video-1"]);
    mocks.analyticsQuery.mockResolvedValue({
      data: {
        columnHeaders: videoHeaders.map((name) => ({ name, columnType: "METRIC", dataType: "INTEGER" })),
        rows,
      },
    });
    mocks.videosList.mockImplementation(async ({ id }: { id: string[] }) => ({
      data: {
        items: id.includes("video-1")
          ? [{
              id: "video-1",
              snippet: {
                title: "First video",
                publishedAt: "2026-08-01T10:00:00Z",
                thumbnails: { high: { url: "https://img.example/1.jpg" } },
              },
            }]
          : [],
      },
    }));

    const result = await createYouTubeAnalyticsAdapter({}).fetchContentDaily(input());

    expect(mocks.videosList).toHaveBeenCalledTimes(2);
    expect(mocks.videosList.mock.calls.map(([request]) => request.id.length)).toEqual([50, 1]);
    expect(mocks.videosList.mock.calls[0]?.[0]).toEqual({
      part: ["snippet"],
      id: Array.from({ length: 50 }, (_, index) => `video-${index + 1}`),
    });
    expect(mocks.videosList.mock.calls[1]?.[0]).toEqual({
      part: ["snippet"],
      id: ["video-51"],
    });
    expect(result[0]).toMatchObject({
      contentId: null,
      channelId: "channel-1",
      channelTitle: "Channel",
      videoId: "video-1",
      title: "First video",
      thumbnailUrl: "https://img.example/1.jpg",
    });
    expect(result[0]?.publishedAt?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
    expect(result[50]).toMatchObject({
      contentId: null,
      videoId: "video-51",
      title: "",
      thumbnailUrl: null,
      publishedAt: null,
    });
    expect(mocks.channelsList).toHaveBeenCalledWith({
      part: ["snippet", "statistics"],
      mine: true,
    });
  });

  it("advances one-based pagination and stops after a short page", async () => {
    const videoHeaders = [...headers, "video"];
    const page = Array.from({ length: 200 }, (_, index) => [
      ...metricRow("2026-08-20", "1"),
      `video-${index + 1}`,
    ]);
    mocks.analyticsQuery
      .mockResolvedValueOnce({
        data: {
          columnHeaders: videoHeaders.map((name) => ({ name, columnType: "METRIC", dataType: "INTEGER" })),
          rows: page,
        },
      })
      .mockResolvedValueOnce({
        data: {
          columnHeaders: videoHeaders.map((name) => ({ name, columnType: "METRIC", dataType: "INTEGER" })),
          rows: [[...metricRow("2026-08-20", "1"), "video-201"]],
        },
      });

    const result = await createYouTubeAnalyticsAdapter({}).fetchContentDaily(input());

    expect(result).toHaveLength(201);
    expect(mocks.analyticsQuery.mock.calls.map(([request]) => request.startIndex)).toEqual([1, 201]);
    expect(mocks.analyticsQuery.mock.calls[0]?.[0]).toEqual({
      ids: "channel==MINE",
      dimensions: "day,video",
      metrics,
      startDate: "2026-08-19",
      endDate: "2026-08-21",
      startIndex: 1,
      maxResults: 200,
    });
  });
});

describe("Dimension fetchers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getGoogleOAuthClient.mockImplementation(() => ({
      setCredentials: mocks.setCredentials,
    }));
    mocks.youtubeAnalytics.mockReturnValue({ reports: { query: mocks.analyticsQuery } });
    mocks.youtube.mockReturnValue({
      channels: { list: mocks.channelsList },
      videos: { list: mocks.videosList },
    });
    mocks.channelsList.mockResolvedValue({
      data: {
        items: [{
          id: "channel-1",
          snippet: { title: "Channel" },
          statistics: { subscriberCount: "1234" },
        }],
      },
    });
    mocks.videosList.mockResolvedValue({ data: { items: [] } });
  });

  it("maps geo rows with country dimension", async () => {
    const geoHeaders = [...headers, "country"];
    mocks.analyticsQuery.mockResolvedValue({
      data: {
        columnHeaders: geoHeaders.map((name) => ({ name })),
        rows: [["2026-08-20", "10", "120", "30", "4", "3", "2", "5", "1", "45.5", "IR"]],
      },
    });
    const adapter = createYouTubeAnalyticsAdapter({});
    const result = await (adapter as any).fetchGeoDaily(input());
    expect(result[0].country).toBe("IR");
    expect(result[0].views).toBe(10);
  });

  it("handles empty rows for geo fetcher", async () => {
    const geoHeaders = [...headers, "country"];
    mocks.analyticsQuery.mockResolvedValue({
      data: {
        columnHeaders: geoHeaders.map((name) => ({ name })),
        rows: null,
      },
    });
    const adapter = createYouTubeAnalyticsAdapter({});
    const result = await (adapter as any).fetchGeoDaily(input());
    expect(result).toEqual([]);
  });

  it("maps age/gender rows with dimensions", async () => {
    const agHeaders = [...headers, "ageGroup", "gender"];
    mocks.analyticsQuery.mockResolvedValue({
      data: {
        columnHeaders: agHeaders.map((name) => ({ name })),
        rows: [["2026-08-20", "10", "120", "30", "4", "3", "2", "5", "1", "45.5", "age25_34", "male"]],
      },
    });
    const adapter = createYouTubeAnalyticsAdapter({});
    const result = await (adapter as any).fetchAgeGenderDaily(input());
    expect(result[0].ageGroup).toBe("age25_34");
    expect(result[0].gender).toBe("male");
  });

  it("handles empty rows for retention fetcher", async () => {
    const retHeaders = [...headers, "video"];
    mocks.analyticsQuery.mockResolvedValue({
      data: {
        columnHeaders: retHeaders.map((name) => ({ name })),
        rows: null,
      },
    });
    const adapter = createYouTubeAnalyticsAdapter({});
    const result = await (adapter as any).fetchRetentionDaily(input());
    expect(result).toEqual([]);
  });
});
