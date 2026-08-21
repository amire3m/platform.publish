import { describe, expect, it } from "vitest";
import { sortTopVideos } from "./top-videos-sort";
import type { AnalyticsOverview } from "@/lib/analytics/types";

type TopVideo = AnalyticsOverview["topVideos"][number];

function video(id: string, views: number, watch: number, engagement: number, change: number | null): TopVideo {
  return {
    accountId: "a",
    channelId: "channel-a",
    channelTitle: "Channel A",
    contentId: null,
    videoId: id,
    title: id,
    thumbnailUrl: null,
    publishedAt: null,
    totals: {
      views,
      watchTimeMinutes: watch,
      engagementRate: engagement,
      likes: 0,
      comments: 0,
      shares: 0,
      subscribersGained: 0,
      subscribersLost: 0,
      subscriberGrowth: 0,
    },
    percentageChanges: {
      views: change,
      watchTimeMinutes: null,
      engagementRate: null,
      likes: null,
      comments: null,
      shares: null,
      subscriberGrowth: null,
    },
  };
}

describe("sortTopVideos", () => {
  const videos = [video("first", 10, 50, 2, null), video("second", 30, 10, 8, -5), video("third", 30, 80, 4, 20)];

  it.each([
    ["views", ["second", "third", "first"]],
    ["watchTimeMinutes", ["third", "first", "second"]],
    ["engagementRate", ["second", "third", "first"]],
    ["change", ["third", "second", "first"]],
  ] as const)("sorts descending by %s with stable ties and missing changes last", (key, ids) => {
    expect(sortTopVideos(videos, key, "desc").map((item) => item.videoId)).toEqual(ids);
  });

  it("does not mutate API ordering", () => {
    sortTopVideos(videos, "views", "asc");
    expect(videos.map((item) => item.videoId)).toEqual(["first", "second", "third"]);
  });
});
