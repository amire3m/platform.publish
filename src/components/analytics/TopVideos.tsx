"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { AnalyticsThumbnail } from "./AnalyticsThumbnail";
import { sortTopVideos, type SortDirection, type TopVideoSortKey } from "./top-videos-sort";
import { formatAnalyticsDate, formatAnalyticsNumber, formatComparison, formatWatchMinutes } from "@/lib/analytics/presentation";
import type { AnalyticsOverview } from "@/lib/analytics/types";

type TopVideo = AnalyticsOverview["topVideos"][number];

function detailHref(videoId: string, accountId: string, range: number, exportScope: "account" | "content"): string {
  const params = new URLSearchParams({ range: String(range), scope: exportScope });
  if (accountId) params.set("accountId", accountId);
  return `/analytics/content/${encodeURIComponent(videoId)}?${params.toString()}`;
}

function SortHeader({ label, sortKey, activeKey, direction, onSort }: {
  label: string;
  sortKey: TopVideoSortKey;
  activeKey: TopVideoSortKey;
  direction: SortDirection;
  onSort: (key: TopVideoSortKey) => void;
}) {
  const active = sortKey === activeKey;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`مرتب‌سازی بر اساس ${label}`}
      aria-pressed={active}
      className="inline-flex items-center gap-1 rounded px-1 py-2 text-start transition hover:bg-tg-hover hover:text-tg-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent"
    >
      {label}<Icon className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

export function TopVideos({ videos, accountId, range, exportScope }: {
  videos: readonly TopVideo[];
  accountId: string;
  range: number;
  exportScope: "account" | "content";
}) {
  const [sortKey, setSortKey] = useState<TopVideoSortKey>("views");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const sortedVideos = sortTopVideos(videos, sortKey, direction);

  function changeSort(key: TopVideoSortKey) {
    if (key === sortKey) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDirection("desc");
    }
  }

  return (
    <section className="rounded-xl border border-tg-border bg-tg-surface" aria-labelledby="top-videos-title">
      <div className="border-b border-tg-border px-4 py-4 sm:px-5">
        <h2 id="top-videos-title" className="font-bold text-tg-text">ویدیوهای برتر</h2>
        <p className="mt-1 text-xs text-tg-secondary">رتبه‌بندی بر اساس بازه انتخاب‌شده؛ ستون‌های آماری در دسکتاپ قابل مرتب‌سازی‌اند.</p>
      </div>

      {videos.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-tg-secondary">هنوز داده‌ای برای رتبه‌بندی ویدیوها وجود ندارد.</div>
      ) : (
        <>
          <div className="hidden border-b border-tg-border px-5 py-2 lg:flex items-center gap-3 text-[11px] font-semibold text-tg-secondary">
            <SortHeader label="بازدید" sortKey="views" activeKey={sortKey} direction={direction} onSort={changeSort} />
            <SortHeader label="زمان تماشا" sortKey="watchTimeMinutes" activeKey={sortKey} direction={direction} onSort={changeSort} />
            <SortHeader label="تعامل" sortKey="engagementRate" activeKey={sortKey} direction={direction} onSort={changeSort} />
            <SortHeader label="تغییر دوره" sortKey="change" activeKey={sortKey} direction={direction} onSort={changeSort} />
          </div>
          <div className="flex gap-4 overflow-x-auto p-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-tg-border">
            {sortedVideos.map((video, index) => {
              const delta = formatComparison(video.percentageChanges.views);
              return (
                <Link
                  key={`${video.accountId}:${video.videoId}`}
                  href={detailHref(video.videoId, accountId, range, exportScope)}
                  className="group flex w-72 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-tg-border bg-white transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent"
                >
                  <div className="relative">
                    <AnalyticsThumbnail key={video.thumbnailUrl} src={video.thumbnailUrl} title={video.title} width={288} height={162} className="h-40 w-full object-cover" />
                    <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white">#{formatAnalyticsNumber(index + 1)}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-tg-text">{video.title}</p>
                    <p className="mt-1 truncate text-xs text-tg-secondary">{video.channelTitle}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <span className="rounded bg-tg-hover px-2 py-1 text-center font-medium text-tg-text">{formatAnalyticsNumber(video.totals.views, "compact")} بازدید</span>
                      <span className="rounded bg-tg-hover px-2 py-1 text-center font-medium text-tg-text">{formatAnalyticsNumber(video.totals.engagementRate)}٪ تعامل</span>
                    </div>
                    <p className={`mt-2 text-center text-xs font-medium ${delta.tone === "positive" ? "text-emerald-600" : delta.tone === "negative" ? "text-rose-600" : "text-tg-secondary"}`}>{delta.label}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
