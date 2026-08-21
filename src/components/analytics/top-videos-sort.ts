import type { AnalyticsOverview } from "@/lib/analytics/types";

export type TopVideoSortKey = "views" | "watchTimeMinutes" | "engagementRate" | "change";
export type SortDirection = "asc" | "desc";

type TopVideo = AnalyticsOverview["topVideos"][number];

function sortValue(video: TopVideo, key: TopVideoSortKey): number | null {
  if (key === "change") return video.percentageChanges.views;
  return video.totals[key];
}

export function sortTopVideos(
  videos: readonly TopVideo[],
  key: TopVideoSortKey,
  direction: SortDirection,
): TopVideo[] {
  return videos
    .map((video, index) => ({ video, index, value: sortValue(video, key) }))
    .sort((a, b) => {
      if (a.value == null && b.value == null) return a.index - b.index;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      const difference = direction === "asc" ? a.value - b.value : b.value - a.value;
      return difference || a.index - b.index;
    })
    .map(({ video }) => video);
}
