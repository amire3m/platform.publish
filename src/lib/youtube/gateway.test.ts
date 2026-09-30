import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  quotaUnits: 0,
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ units: mocks.quotaUnits }],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => {},
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({
  credentials: { id: "id" },
  socialAccounts: { id: "id" },
  youtubeQuotaUsage: { accountId: "accountId", day: "day", units: "units", updatedAt: "updatedAt" },
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "{}" }));
vi.mock("@/lib/providers/youtube", () => ({
  getGoogleOAuthClient: () => ({ setCredentials: () => {} }),
}));
vi.mock("googleapis", () => ({ google: { youtube: () => ({}) } }));

import { GatewayError, getChannelFull, getVideosFull, type AuthedClient } from "./gateway";

let clientSeq = 0;
function fakeClient(youtube: unknown): AuthedClient {
  // Unique account per test: gateway caches by accountId in-memory
  clientSeq += 1;
  return { accountId: `ACC-${clientSeq}`, youtube: youtube as AuthedClient["youtube"] };
}

describe("youtube gateway", () => {
  beforeEach(() => {
    mocks.quotaUnits = 0;
  });

  it("maps channel full profile", async () => {
    const youtube = {
      channels: {
        list: async () => ({
          data: {
            items: [
              {
                id: "UC123",
                snippet: { title: "Ch", description: "d", customUrl: "@ch", thumbnails: { medium: { url: "http://t" } } },
                statistics: { subscriberCount: "100", viewCount: "2000", videoCount: "5" },
                topicDetails: { topicCategories: ["https://en.wikipedia.org/wiki/Music"] },
                contentDetails: { relatedPlaylists: { uploads: "UU123" } },
              },
            ],
          },
        }),
      },
    };
    const ch = await getChannelFull(fakeClient(youtube));
    expect(ch).toMatchObject({ id: "UC123", title: "Ch", uploadsPlaylistId: "UU123" });
    expect(ch.statistics.subscriberCount).toBe(100);
    expect(ch.topicCategories).toHaveLength(1);
  });

  it("maps videos incl. copyright rejection fields", async () => {
    const youtube = {
      videos: {
        list: async () => ({
          data: {
            items: [
              {
                id: "vid1",
                snippet: { title: "V", description: "", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} },
                status: { uploadStatus: "rejected", rejectionReason: "claim", privacyStatus: "private", license: "youtube", embeddable: true },
                contentDetails: { duration: "PT1M", dimension: "2d", definition: "hd", licensedContent: true },
                statistics: { viewCount: "10" },
              },
            ],
          },
        }),
      },
    };
    const [v] = await getVideosFull(fakeClient(youtube), ["vid1"]);
    expect(v).toMatchObject({ id: "vid1", uploadStatus: "rejected", rejectionReason: "claim", licensedContent: true });
    expect(v.statistics.viewCount).toBe(10);
  });

  it("refuses when daily quota is exhausted", async () => {
    mocks.quotaUnits = 8000;
    const youtube = { channels: { list: async () => ({ data: { items: [] } }) } };
    await expect(getChannelFull(fakeClient(youtube))).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });

  it("maps reconnect errors to RECONNECT_REQUIRED", async () => {
    const youtube = {
      channels: {
        list: async () => {
          const e = new Error("invalid_grant") as Error & { code: number };
          e.code = 401;
          throw e;
        },
      },
    };
    await expect(getChannelFull(fakeClient(youtube))).rejects.toMatchObject({ code: "RECONNECT_REQUIRED" });
    expect(GatewayError).toBeDefined();
  });
});
