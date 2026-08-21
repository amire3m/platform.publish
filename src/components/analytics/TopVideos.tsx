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
        <div className="divide-y divide-tg-border">
          <div className="hidden grid-cols-[2rem_minmax(16rem,1fr)_6rem_7rem_6rem_7rem] items-center gap-3 px-5 text-[11px] font-semibold text-tg-secondary lg:grid">
            <span>رتبه</span><span>ویدیو</span>
            <SortHeader label="بازدید" sortKey="views" activeKey={sortKey} direction={direction} onSort={changeSort} />
            <SortHeader label="زمان تماشا" sortKey="watchTimeMinutes" activeKey={sortKey} direction={direction} onSort={changeSort} />
            <SortHeader label="تعامل" sortKey="engagementRate" activeKey={sortKey} direction={direction} onSort={changeSort} />
            <SortHeader label="تغییر دوره" sortKey="change" activeKey={sortKey} direction={direction} onSort={changeSort} />
          </div>
          {sortedVideos.map((video, index) => {
            const delta = formatComparison(video.percentageChanges.views);
            return (
              <Link
                key={`${video.accountId}:${video.videoId}`}
                href={detailHref(video.videoId, accountId, range, exportScope)}
                className="grid gap-3 px-4 py-4 transition hover:bg-tg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tg-accent lg:grid-cols-[2rem_minmax(16rem,1fr)_6rem_7rem_6rem_7rem] lg:items-center lg:px-5"
              >
                <span className="text-sm font-bold text-tg-secondary">{formatAnalyticsNumber(index + 1)}</span>
                <span className="flex min-w-0 items-center gap-3">
                  <AnalyticsThumbnail key={video.thumbnailUrl} src={video.thumbnailUrl} title={video.title} width={96} height={56} className="h-14 w-24 shrink-0 rounded-lg" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-tg-text">{video.title}</span>
                    <span className="mt-1 block truncate text-xs text-tg-secondary">{video.channelTitle} · {video.publishedAt ? formatAnalyticsDate(video.publishedAt) : "تاریخ انتشار نامشخص"}</span>
                  </span>
                </span>
                <span className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:contents">
                  <span><span className="block text-[10px] text-tg-secondary lg:hidden">بازدید</span><span className="text-sm font-medium text-tg-text">{formatAnalyticsNumber(video.totals.views, "compact")}</span></span>
                  <span><span className="block text-[10px] text-tg-secondary lg:hidden">زمان تماشا</span><span className="text-sm font-medium text-tg-text">{formatWatchMinutes(video.totals.watchTimeMinutes)}</span></span>
                  <span><span className="block text-[10px] text-tg-secondary lg:hidden">تعامل</span><span className="text-sm font-medium text-tg-text">{formatAnalyticsNumber(video.totals.engagementRate)}٪</span></span>
                  <span><span className="block text-[10px] text-tg-secondary lg:hidden">تغییر دوره</span><span className={`text-xs font-medium ${delta.tone === "positive" ? "text-emerald-700 dark:text-emerald-400" : delta.tone === "negative" ? "text-rose-700 dark:text-rose-400" : "text-tg-secondary"}`}>{delta.label}</span></span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
