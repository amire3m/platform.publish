"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import useSWR, { mutate as mutateCache } from "swr";
import { AlertTriangle, ArrowRight, RotateCcw } from "lucide-react";
import { AnalyticsStatRail, type AnalyticsStat } from "@/components/analytics/AnalyticsStatRail";
import { AnalyticsThumbnail } from "@/components/analytics/AnalyticsThumbnail";
import { AnalyticsTrendChart } from "@/components/analytics/AnalyticsTrendChart";
import { SyncStatus } from "@/components/analytics/SyncStatus";
import { SyncResults } from "@/components/analytics/SyncResults";
import { useToast } from "@/components/providers";
import { Button, Skeleton } from "@/components/ui";
import { channelAverageMetrics, combinedInteractionsChange, formatAnalyticsDate, formatAnalyticsNumber, formatComparison, formatWatchMinutes } from "@/lib/analytics/presentation";
import type { AnalyticsRange, ContentAnalytics, MetricTotals, PeriodComparison } from "@/lib/analytics/types";
import type { AccountSyncResult } from "@/lib/analytics/sync";

interface ApiEnvelope<T> { ok: boolean; data?: T; error?: string; code?: string }

class DetailRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function fetchDetail(url: string): Promise<ContentAnalytics> {
  const response = await fetch(url);
  const body = await response.json() as ApiEnvelope<ContentAnalytics>;
  if (!response.ok || !body.ok || !body.data) throw new DetailRequestError(body.error ?? "دریافت آمار ویدیو ناموفق بود.", response.status);
  return body.data;
}

function detailRange(value: string | null): AnalyticsRange {
  return value === "7" || value === "30" ? Number(value) as AnalyticsRange : 90;
}

function backHref(range: AnalyticsRange, accountId: string, scope: string): string {
  const params = new URLSearchParams({ range: String(range), scope: scope === "content" ? "content" : "account" });
  if (accountId) params.set("accountId", accountId);
  return `/analytics?${params.toString()}`;
}

function detailStats(comparison: PeriodComparison): AnalyticsStat[] {
  const { current: totals, previous, percentageChanges: changes } = comparison;
  return [
    { label: "بازدید", value: formatAnalyticsNumber(totals.views), comparison: formatComparison(changes.views) },
    { label: "زمان تماشا", value: formatWatchMinutes(totals.watchTimeMinutes), comparison: formatComparison(changes.watchTimeMinutes) },
    { label: "پسندیدن", value: formatAnalyticsNumber(totals.likes), comparison: formatComparison(changes.likes) },
    { label: "نظر و اشتراک", value: formatAnalyticsNumber(totals.comments + totals.shares), comparison: formatComparison(combinedInteractionsChange(totals, previous)) },
    { label: "نرخ تعامل", value: `${formatAnalyticsNumber(totals.engagementRate)}٪`, comparison: formatComparison(changes.engagementRate) },
  ];
}

function channelAverageStats(data: ContentAnalytics): AnalyticsStat[] {
  const { totals, percentageChanges: differences } = channelAverageMetrics(data.channelAverageComparison);
  return [
    { label: "بازدید", value: formatAnalyticsNumber(totals.views), comparison: formatComparison(differences.views) },
    { label: "زمان تماشا", value: formatWatchMinutes(totals.watchTimeMinutes), comparison: formatComparison(differences.watchTimeMinutes) },
    { label: "پسندیدن", value: formatAnalyticsNumber(totals.likes), comparison: formatComparison(differences.likes) },
    { label: "نظر", value: formatAnalyticsNumber(totals.comments), comparison: formatComparison(differences.comments) },
    { label: "نرخ تعامل", value: `${formatAnalyticsNumber(totals.engagementRate)}٪`, comparison: formatComparison(differences.engagementRate) },
  ];
}

function VideoAnalyticsDetail() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const range = detailRange(searchParams.get("range"));
  const accountFilter = searchParams.get("accountId") ?? "";
  const exportScope = searchParams.get("scope") ?? "account";
  const requestUrl = `/api/analytics/content/${encodeURIComponent(params.id)}?range=${range}`;
  const { data, error, isLoading, mutate } = useSWR<ContentAnalytics>(requestUrl, fetchDetail);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<AccountSyncResult[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function syncAnalytics() {
    setSyncResults(null);
    setSyncError(null);
    setSyncing(true);
    try {
      const response = await fetch("/api/analytics/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: data?.accountId ? JSON.stringify({ accountId: data.accountId }) : "",
      });
      const body = await response.json() as ApiEnvelope<{ results: AccountSyncResult[]; succeeded: number; failed: number; skipped: number }>;
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error ?? "همگام‌سازی ناموفق بود.");
      setSyncResults(body.data.results);
      const reconnect = body.data.results.some((result) => result.code === "RECONNECT_REQUIRED");
      showToast(reconnect ? "اتصال کانال منقضی شده است؛ حساب یوتیوب را دوباره متصل کنید." : "آمار ویدیو به‌روزرسانی شد.", reconnect || body.data.failed > 0 ? "error" : "success");
      await Promise.all([mutate(), mutateCache("/api/accounts")]);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "همگام‌سازی ناموفق بود.";
      setSyncError(message);
      showToast(message, "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <Link href={backHref(range, accountFilter, exportScope)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-tg-secondary transition hover:text-tg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0">
        <ArrowRight className="h-4 w-4" />بازگشت به آنالیز
      </Link>

      {isLoading && <DetailLoading />}
      <SyncResults results={syncResults} error={syncError} accountNames={data ? { [data.accountId]: data.channelTitle } : {}} />
      {!isLoading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-700 dark:text-rose-300">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><h1 className="font-bold">{error.status === 404 ? "ویدیو یافت نشد یا دسترسی ندارید" : "آمار ویدیو دریافت نشد"}</h1><p className="mt-1 text-sm">{error.message}</p></div></div>
          <Button variant="secondary" size="sm" className="mt-4 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0" onClick={() => mutate()}><RotateCcw className="h-4 w-4" />تلاش دوباره</Button>
        </div>
      )}

      {data && (
        <>
          <header className="flex min-w-0 flex-col gap-4 border-b border-tg-border pb-5 sm:flex-row sm:items-center">
            <AnalyticsThumbnail key={data.thumbnailUrl} src={data.thumbnailUrl} title={data.title} width={192} height={112} className="h-28 w-full shrink-0 rounded-xl sm:w-48" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-8 text-tg-text">{data.title}</h1>
              <p className="mt-1 text-sm text-tg-secondary">{data.channelTitle}</p>
              <p className="mt-2 text-xs text-tg-secondary">{data.publishedAt ? `منتشرشده در ${formatAnalyticsDate(data.publishedAt)}` : "تاریخ انتشار از یوتیوب دریافت نشده است"}</p>
            </div>
          </header>

          <AnalyticsStatRail stats={detailStats(data.comparison)} />
          {data.freshness.state === "error" && <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">بخشی از داده‌های این ویدیو نمایش داده می‌شود؛ همگام‌سازی اخیر کامل نشده است.</div>}
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <AnalyticsTrendChart series={data.chartSeries} title="روند این ویدیو" />
            <SyncStatus freshness={data.freshness} syncing={syncing} onSync={syncAnalytics} />
          </div>
          <section className="space-y-3" aria-labelledby="channel-comparison-title">
            <div><h2 id="channel-comparison-title" className="font-bold text-tg-text">مقایسه با میانگین کانال</h2><p className="mt-1 text-xs text-tg-secondary">درصدهای زیر اختلاف این ویدیو با میانگین ویدیوهای کانال را نشان می‌دهند.</p></div>
            <AnalyticsStatRail stats={channelAverageStats(data)} />
          </section>
        </>
      )}
    </div>
  );
}

function DetailLoading() {
  return <div className="space-y-5" role="status" aria-busy="true" aria-label="در حال دریافت آمار ویدیو"><Skeleton className="h-32" /><Skeleton className="h-24" /><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]"><Skeleton className="h-[23rem]" /><Skeleton className="h-44" /></div></div>;
}

export default function AnalyticsContentPage() {
  return <Suspense fallback={<DetailLoading />}><VideoAnalyticsDetail /></Suspense>;
}
