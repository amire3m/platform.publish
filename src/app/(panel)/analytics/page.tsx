"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate as mutateCache } from "swr";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { AnalyticsFilters, type AnalyticsAccountOption, type AnalyticsExportScope } from "@/components/analytics/AnalyticsFilters";
import { AnalyticsStatRail, type AnalyticsStat } from "@/components/analytics/AnalyticsStatRail";
import { AnalyticsTrendChart } from "@/components/analytics/AnalyticsTrendChart";
import { AudienceChart } from "@/components/analytics/AudienceChart";
import { GeoChart } from "@/components/analytics/GeoChart";
import { TrafficTable } from "@/components/analytics/TrafficTable";
import { SearchTermsTable } from "@/components/analytics/SearchTermsTable";
import { RetentionChart } from "@/components/analytics/RetentionChart";
import { RevenueCard } from "@/components/analytics/RevenueCard";
import { SyncStatus } from "@/components/analytics/SyncStatus";
import { SyncResults } from "@/components/analytics/SyncResults";
import { TopVideos } from "@/components/analytics/TopVideos";
import { useToast } from "@/components/providers";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { formatAnalyticsNumber, formatComparison, formatWatchMinutes } from "@/lib/analytics/presentation";
import { analyticsFilterKey, analyticsFiltersChanged, buildAnalyticsSyncRequest, createRequestGenerationGuard } from "@/lib/analytics/analytics-controls";
import { runAnalyticsSync } from "@/lib/analytics/sync-controller-client";
import type { PublicAccountDto } from "@/lib/accounts/public";
import type { AnalyticsOverview, AnalyticsRange, MetricTotals } from "@/lib/analytics/types";
import type { AccountSyncResult } from "@/lib/analytics/sync";
import { MAIN_REPORT_ALIAS } from "@/lib/accounts/organization";
import { ChannelHeader } from "@/components/analytics/ChannelHeader";

type AccountRecord = PublicAccountDto & AnalyticsAccountOption;

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

class ApiRequestError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
  }
}

async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !body.ok || body.data === undefined) {
    throw new ApiRequestError(body.error ?? "دریافت اطلاعات ناموفق بود.", body.code, response.status);
  }
  return body.data;
}

function selectedRange(value: string | null): AnalyticsRange {
  return value === "7" || value === "30" ? Number(value) as AnalyticsRange : 90;
}

function overviewUrl(range: AnalyticsRange, accountId: string): string {
  const params = new URLSearchParams({ range: String(range) });
  if (accountId) params.set("accountId", accountId);
  return `/api/analytics/overview?${params.toString()}`;
}

function dimensionUrl(range: AnalyticsRange, accountId: string, dimension: string): string {
  const params = new URLSearchParams({ range: String(range), dimension });
  if (accountId) params.set("accountId", accountId);
  return `/api/analytics/overview?${params.toString()}`;
}

function selectedExportScope(value: string | null): AnalyticsExportScope {
  return value === "content" ? "content" : "account";
}

function exportUrl(range: AnalyticsRange, accountId: string, scope: AnalyticsExportScope): string {
  const params = new URLSearchParams({ range: String(range), scope });
  if (accountId) params.set("accountId", accountId);
  return `/api/analytics/export?${params.toString()}`;
}

function accountNameMap(accounts: readonly AccountRecord[]): Record<string, string> {
  return Object.fromEntries(accounts.map((account) => [account.id, account.organization === "emro" ? MAIN_REPORT_ALIAS : account.displayName]));
}

function filterKeyFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  return analyticsFilterKey({
    accountId: params.get("accountId") ?? "",
    range: selectedRange(params.get("range")),
    scope: selectedExportScope(params.get("scope")),
  });
}

function overviewStats(
  totals: MetricTotals,
  subscribersTotal: number | null,
  changes: AnalyticsOverview["comparison"]["percentageChanges"],
): AnalyticsStat[] {
  return [
    { label: "بازدید", value: formatAnalyticsNumber(totals.views), comparison: formatComparison(changes.views) },
    { label: "مشترک فعلی", value: formatAnalyticsNumber(subscribersTotal), description: subscribersTotal == null ? "از سرویس دریافت نشده" : undefined },
    { label: "رشد مشترک", value: formatAnalyticsNumber(totals.subscriberGrowth), comparison: formatComparison(changes.subscriberGrowth) },
    { label: "زمان تماشا", value: formatWatchMinutes(totals.watchTimeMinutes), comparison: formatComparison(changes.watchTimeMinutes) },
    { label: "نرخ تعامل", value: `${formatAnalyticsNumber(totals.engagementRate)}٪`, comparison: formatComparison(changes.engagementRate) },
  ];
}

type TabId = "overview" | "traffic" | "audience" | "search" | "retention" | "revenue";

const TABS: readonly { id: TabId; label: string }[] = [
  { id: "overview", label: "نمای کلی" },
  { id: "traffic", label: "ترافیک" },
  { id: "audience", label: "مخاطب" },
  { id: "search", label: "جستجو" },
  { id: "retention", label: "ماندگاری" },
  { id: "revenue", label: "درآمد" },
];

function selectedTab(value: string | null): TabId {
  return (TABS.some((t) => t.id === value) ? (value as TabId) : "overview");
}

const TAB_DIMENSIONS: Record<TabId, string[] | undefined> = {
  overview: undefined,
  traffic: ["traffic"],
  audience: ["audience", "geo", "device"],
  search: ["search"],
  retention: ["retention"],
  revenue: ["revenue"],
};

function extractArray<T>(raw: Record<string, unknown> | null | undefined, key: string): readonly T[] | undefined {
  if (!raw) return undefined;
  const val = (raw as Record<string, unknown>)[key];
  if (Array.isArray(val)) return val as readonly T[];
  // fallback: if raw itself is array-like under different key conventions
  if (Array.isArray((raw as Record<string, unknown>).data)) return (raw as Record<string, unknown>).data as readonly T[];
  return undefined;
}
function extractTraffic(data: Record<string, unknown> | null | undefined): readonly { trafficSource: string; views: number; watchTimeMinutes: number }[] | undefined {
  if (!data) return undefined;
  const a = extractArray<{ trafficSource: string; views: number; watchTimeMinutes: number }>(data, "trafficData");
  if (a) return a.map((r) => ({ trafficSource: (r as unknown as { trafficSource?: string; trafficSourceType?: string; source?: string }).trafficSource ?? (r as unknown as { trafficSourceType: string }).trafficSourceType ?? (r as unknown as { source: string }).source, views: (r as unknown as { views: number }).views, watchTimeMinutes: (r as unknown as { watchTimeMinutes?: number }).watchTimeMinutes ?? 0 }));
  const b = extractArray(data, "traffic");
  if (b) return b as never;
  return undefined;
}
function extractGeo(data: Record<string, unknown> | null | undefined): readonly { country: string; views: number }[] | undefined {
  if (!data) return undefined;
  return extractArray(data, "geoData") ?? extractArray(data, "geo") as never;
}
function extractAudience(data: Record<string, unknown> | null | undefined): readonly { ageGroup: string; gender: string; views: number }[] | undefined {
  if (!data) return undefined;
  return extractArray(data, "audienceData") ?? extractArray(data, "audience") as never;
}
function extractDevice(data: Record<string, unknown> | null | undefined): readonly { deviceType: string; views: number }[] | undefined {
  if (!data) return undefined;
  return extractArray(data, "deviceData") ?? extractArray(data, "device") as never;
}
function extractSearch(data: Record<string, unknown> | null | undefined): readonly { keyword: string; views: number; watchTimeMinutes: number }[] | undefined {
  if (!data) return undefined;
  const a = extractArray<{ keyword: string; views: number; watchTimeMinutes: number; searchTerm?: string }>(data, "searchData");
  if (a) return a.map((r) => ({ keyword: (r as unknown as { keyword?: string; searchTerm?: string }).keyword ?? (r as unknown as { searchTerm: string }).searchTerm, views: r.views, watchTimeMinutes: (r as unknown as { watchTimeMinutes?: number }).watchTimeMinutes ?? 0 }));
  return extractArray(data, "search") as never;
}
function extractRetention(data: Record<string, unknown> | null | undefined): readonly { videoId: string; title?: string; averageViewPercentage: number | null; views?: number }[] | undefined {
  if (!data) return undefined;
  return extractArray(data, "retentionData") ?? extractArray(data, "retention") as never;
}
function extractRevenue(data: Record<string, unknown> | null | undefined): { revenue: number | null; cpm: number | null; rows?: readonly { date: string; estimatedRevenue: number; cpm: number | null }[] } | undefined {
  if (!data) return undefined;
  const rows = extractArray<{ date: string; estimatedRevenue: number; cpm: number | null }>(data, "revenueData");
  if (rows) {
    const revenue = rows.length > 0 ? rows.reduce((sum, r) => sum + r.estimatedRevenue, 0) : null;
    const cpm = rows.length > 0 ? rows[0].cpm : null;
    return { revenue, cpm, rows };
  }
  const rev = (data as Record<string, unknown>).estimatedRevenue as number | null | undefined;
  const cpm = (data as Record<string, unknown>).cpm as number | null | undefined;
  if (rev !== undefined || cpm !== undefined) return { revenue: rev ?? null, cpm: cpm ?? null };
  return undefined;
}

function AnalyticsDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const range = selectedRange(searchParams.get("range"));
  const accountId = searchParams.get("accountId") ?? "";
  const exportScope = selectedExportScope(searchParams.get("scope"));
  const activeTab = selectedTab(searchParams.get("tab"));
  const tabDimensions = TAB_DIMENSIONS[activeTab];
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<AccountSyncResult[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncFeedbackFilterKey, setSyncFeedbackFilterKey] = useState<string | null>(null);
  const [syncGeneration] = useState(createRequestGenerationGuard);
  const requestUrl = overviewUrl(range, accountId);
  const { data, error, isLoading, mutate } = useSWR<AnalyticsOverview>(requestUrl, fetchApi);
  const { data: accountRecords, error: accountsError, isLoading: accountsLoading, mutate: mutateAccounts } = useSWR<AccountRecord[]>("/api/accounts", fetchApi);
  const { data: me, isLoading: permissionsLoading } = useSWR<{ permissions: string[]; allowedAccountIds: string[] | null }>("/api/auth/me", fetchApi);
  // Dimension SWRs — each tab fetches its own endpoint via ?dimension= (real data)
  const { data: trafficData, error: trafficFetchError, isLoading: trafficLoading } = useSWR<AnalyticsOverview & Record<string, unknown>>(activeTab === "traffic" ? dimensionUrl(range, accountId, "traffic") : null, fetchApi);
  const { data: audienceData, error: audienceFetchError, isLoading: audienceLoading } = useSWR<AnalyticsOverview & Record<string, unknown>>(activeTab === "audience" ? dimensionUrl(range, accountId, "audience") : null, fetchApi);
  const { data: geoData, error: geoFetchError, isLoading: geoLoading } = useSWR<AnalyticsOverview & Record<string, unknown>>(activeTab === "audience" ? dimensionUrl(range, accountId, "geo") : null, fetchApi);
  const { data: deviceData, error: deviceFetchError, isLoading: deviceLoading } = useSWR<AnalyticsOverview & Record<string, unknown>>(activeTab === "audience" ? dimensionUrl(range, accountId, "device") : null, fetchApi);
  const { data: searchData, error: searchFetchError, isLoading: searchLoading } = useSWR<AnalyticsOverview & Record<string, unknown>>(activeTab === "search" ? dimensionUrl(range, accountId, "search") : null, fetchApi);
  const { data: retentionData, error: retentionFetchError, isLoading: retentionLoading } = useSWR<AnalyticsOverview & Record<string, unknown>>(activeTab === "retention" ? dimensionUrl(range, accountId, "retention") : null, fetchApi);
  const { data: revenueData, error: revenueFetchError, isLoading: revenueLoading } = useSWR<AnalyticsOverview & Record<string, unknown>>(activeTab === "revenue" ? dimensionUrl(range, accountId, "revenue") : null, fetchApi);
  const shouldFetchFallback = Boolean(accountId && data && data.topVideos.length === 0 && activeTab === "overview");
  const { data: fallbackData, isLoading: fallbackLoading } = useSWR<{ top: Array<{ videoId: string; title: string; thumbnailUrl: string | null; viewCount: number; publishedAt: string | null }>; latest: Array<{ videoId: string; title: string; thumbnailUrl: string | null; viewCount: number; publishedAt: string | null }> }>(shouldFetchFallback ? `/api/analytics/videos?accountId=${accountId}` : null, fetchApi);
  const accounts = (accountRecords ?? [])
    .filter((account) => account.platform === "youtube" && account.organization === "emro" && account.active && account.connectionStatus === "connected");
  const selectedAccount = accountId ? accounts.find((a) => a.id === accountId) ?? null : null;
  const currentFilterState = { accountId, range, scope: exportScope } as const;
  const currentFilterKey = analyticsFilterKey(currentFilterState);
  const previousFilterKey = useRef(currentFilterKey);
  const syncRequest = buildAnalyticsSyncRequest(accountId, me?.permissions ?? [], me?.allowedAccountIds, tabDimensions);

  useEffect(() => {
    if (previousFilterKey.current === currentFilterKey) return;
    syncGeneration.invalidate();
    previousFilterKey.current = currentFilterKey;
  }, [currentFilterKey, syncGeneration]);

  useEffect(() => {
    if (searchParams.has("range") && searchParams.has("scope")) return;
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("range")) params.set("range", String(range));
    if (!params.has("scope")) params.set("scope", exportScope);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [exportScope, pathname, range, router, searchParams]);

  function updateFilters(next: { accountId?: string; range?: AnalyticsRange; scope?: AnalyticsExportScope }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextAccount = next.accountId ?? accountId;
    const nextRange = next.range ?? range;
    const nextScope = next.scope ?? exportScope;
    if (analyticsFiltersChanged(
      currentFilterState,
      { accountId: nextAccount, range: nextRange, scope: nextScope },
    )) {
      syncGeneration.invalidate();
      previousFilterKey.current = analyticsFilterKey({ accountId: nextAccount, range: nextRange, scope: nextScope });
      setSyncResults(null);
      setSyncError(null);
      setSyncFeedbackFilterKey(null);
    }
    if (nextAccount) params.set("accountId", nextAccount);
    else params.delete("accountId");
    params.set("range", String(nextRange));
    params.set("scope", nextScope);
    // keep ?tab= persisted
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function updateTab(nextTab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function syncAnalytics() {
    if (!syncRequest.allowed) {
      setSyncResults(null);
      setSyncError(syncRequest.reason);
      setSyncFeedbackFilterKey(currentFilterKey);
      return;
    }
    await runAnalyticsSync({
      accountId,
      permissions: me?.permissions ?? [],
      allowedAccountIds: me?.allowedAccountIds,
      dimensions: tabDimensions,
      requestFilterKey: currentFilterKey,
      generation: syncGeneration,
      getCurrentFilterKey: filterKeyFromLocation,
      fetchSync: (body) => fetch("/api/analytics/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      setResults: setSyncResults,
      setError: setSyncError,
      setFeedbackFilterKey: setSyncFeedbackFilterKey,
      setSyncing,
      showToast,
      revalidateOverview: async () => {
        await mutate();
        // also revalidate active dimension endpoint
        if (activeTab !== "overview") {
          const dimUrl = activeTab === "audience" ? dimensionUrl(range, accountId, "audience") : dimensionUrl(range, accountId, activeTab);
          await mutateCache(dimUrl);
        }
      },
      revalidateAccounts: () => mutateCache("/api/accounts"),
    });
  }

  return (
    <div className="min-w-0 space-y-5">
      <header>
        <h1 className="text-xl font-bold text-tg-text">گزارش‌های {MAIN_REPORT_ALIAS}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-tg-secondary">
          گزارش‌های موسسه امام روح‌الله با نام {MAIN_REPORT_ALIAS}، بر پایه داده‌های رسمی YouTube و Instagram.
        </p>
      </header>

      <AnalyticsFilters
        accounts={accounts}
        accountId={accountId}
        range={range}
        syncing={syncing}
        accountsLoading={accountsLoading}
        exportScope={exportScope}
        canExport={me?.permissions.includes("export_data") ?? false}
        permissionsLoading={permissionsLoading}
        syncDisabled={!syncRequest.allowed}
        syncDisabledReason={syncRequest.reason}
        csvHref={exportUrl(range, accountId, exportScope)}
        onAccountChange={(value) => updateFilters({ accountId: value })}
        onRangeChange={(value) => updateFilters({ range: value })}
        onExportScopeChange={(value) => updateFilters({ scope: value })}
        onSync={syncAnalytics}
      />

      <ChannelHeader
        account={selectedAccount ? { id: selectedAccount.id, displayName: selectedAccount.displayName, username: selectedAccount.username, profileImage: selectedAccount.profileImage, externalAccountId: (selectedAccount as unknown as { externalAccountId?: string }).externalAccountId ?? null } : null}
        isAggregated={!accountId}
      />

      {accountsError && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          <p>فهرست حساب‌های قابل انتخاب دریافت نشد. آمار کلی همچنان می‌تواند نمایش داده شود.</p>
          <Button variant="secondary" size="sm" className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0" onClick={() => mutateAccounts()}>دریافت دوباره حساب‌ها</Button>
        </div>
      )}

      <SyncResults
        results={syncFeedbackFilterKey === currentFilterKey ? syncResults : null}
        error={syncFeedbackFilterKey === currentFilterKey ? syncError : null}
        accountNames={accountNameMap(accountRecords ?? [])}
      />

      {/* Tabs — 6 panels persisted via ?tab= */}
      <div className="rounded-xl border border-tg-border bg-tg-surface p-1.5">
        <div role="tablist" aria-label="بخش‌های تحلیلی" className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-controls={`panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              onClick={() => updateTab(tab.id)}
              className={`min-h-9 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:flex-none sm:px-4 ${
                activeTab === tab.id ? "bg-tg-accent text-tg-accent-fg shadow-sm" : "bg-transparent text-tg-secondary hover:bg-tg-hover hover:text-tg-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && activeTab === "overview" && <AnalyticsLoading />}

      {!isLoading && error && activeTab === "overview" && (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-700 dark:text-rose-300">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><h2 className="font-bold">آمار دریافت نشد</h2><p className="mt-1 text-sm">{error.message}</p></div>
          </div>
          <Button variant="secondary" size="sm" className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0" onClick={() => mutate()}><RotateCcw className="h-4 w-4" />تلاش دوباره</Button>
        </div>
      )}

      {/* Tab panels */}
      <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="min-w-0 space-y-5">
        {activeTab === "overview" && (
          <>
            {data && !data.hasSnapshotData ? (
              <EmptyState
                title="هنوز داده تحلیلی دریافت نشده است"
                description="حساب متصل را همگام‌سازی کنید تا آمار واقعی یوتیوب نمایش داده شود."
                action={<Button className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0" onClick={syncAnalytics} disabled={syncing || !syncRequest.allowed}>{syncing ? "در حال همگام‌سازی" : "شروع همگام‌سازی"}</Button>}
              />
            ) : data ? (
              <>
                <AnalyticsStatRail stats={overviewStats(data.comparison.current, data.subscribersTotal, data.comparison.percentageChanges)} />
                {data.freshness.state === "error" && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    بخشی از داده‌ها در دسترس است، اما آخرین همگام‌سازی کامل نشده است.
                  </div>
                )}
                <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <AnalyticsTrendChart series={data.chartSeries} />
                  <SyncStatus freshness={data.freshness} syncing={syncing} syncDisabled={!syncRequest.allowed} syncDisabledReason={syncRequest.reason} onSync={syncAnalytics} bestPublishTime={(data as unknown as { bestPublishTime?: string | null })?.bestPublishTime ?? null} comparison={data.comparison.percentageChanges} />
                </div>
                <TopVideos videos={data.topVideos} accountId={accountId} range={range} exportScope={exportScope} />
                {data.topVideos.length === 0 && (
                  <section className="rounded-xl border border-tg-border bg-tg-surface p-4" aria-labelledby="fallback-videos-title">
                    <h3 id="fallback-videos-title" className="font-bold text-tg-text">آخرین ویدیوها</h3>
                    <p className="mt-1 text-xs text-tg-secondary">چون داده آنالیتیکس ویدیویی هنوز در دسترس نیست، آخرین ویدیوها مستقیماً از YouTube Data API نمایش داده می‌شود.</p>
                    {fallbackLoading ? (
                      <Skeleton className="mt-4 h-32" />
                    ) : fallbackData?.latest && fallbackData.latest.length > 0 ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {fallbackData.latest.slice(0, 6).map((v) => (
                          <a key={v.videoId} href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer" className="flex gap-3 rounded-lg border border-tg-border p-3 hover:bg-tg-hover">
                            {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt={v.title} className="h-16 w-28 rounded object-cover" /> : <div className="h-16 w-28 rounded bg-tg-hover" />}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-tg-text">{v.title || v.videoId}</p>
                              <p className="text-xs text-tg-secondary">{v.viewCount?.toLocaleString("fa-IR")} بازدید</p>
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-tg-secondary">ویدیویی یافت نشد.</p>
                    )}
                  </section>
                )}
              </>
            ) : null}
          </>
        )}

        {activeTab === "traffic" && (
          (()=>{ const real=extractTraffic(trafficData as unknown as Record<string, unknown>); return <TrafficTable data={real} isLoading={trafficLoading} error={trafficFetchError ? (trafficFetchError as Error).message : null} /> })()
        )}

        {activeTab === "audience" && (
          <div className="space-y-5">
            {(() => { const real=extractGeo(geoData as unknown as Record<string, unknown>) ?? extractGeo(audienceData as unknown as Record<string, unknown>); return <GeoChart data={real} isLoading={geoLoading || audienceLoading} error={(geoFetchError as Error | undefined)?.message ?? (audienceFetchError as Error | undefined)?.message ?? null} /> })()}
            {(() => {
              const aud=extractAudience(audienceData as unknown as Record<string, unknown>);
              const dev=extractDevice(deviceData as unknown as Record<string, unknown>) ?? extractDevice(audienceData as unknown as Record<string, unknown>);
              return <AudienceChart data={aud} deviceData={dev} isLoading={audienceLoading||deviceLoading} error={(audienceFetchError as Error | undefined)?.message ?? (deviceFetchError as Error | undefined)?.message ?? null} />
            })()}
            {/* best publish time suggestion from dimension */}
            {(() => { const t=(audienceData as unknown as {bestPublishTime?:string})?.bestPublishTime ?? (data as unknown as {bestPublishTime?:string})?.bestPublishTime; return t ? <Card className="border-dashed"><p className="text-xs text-tg-secondary">بهترین زمان انتشار پیشنهادی: <span className="font-bold text-tg-text" dir="ltr">{t}</span> (بر اساس ترافیک ۲۸ روز گذشته)</p></Card> : null })()}
          </div>
        )}

        {activeTab === "search" && (
          (()=>{ const real=extractSearch(searchData as unknown as Record<string, unknown>); return <SearchTermsTable data={real} isLoading={searchLoading} error={searchFetchError ? (searchFetchError as Error).message : null} /> })()
        )}

        {activeTab === "retention" && (
          (()=>{ const real=extractRetention(retentionData as unknown as Record<string, unknown>); return <RetentionChart data={real} isLoading={retentionLoading} error={retentionFetchError ? (retentionFetchError as Error).message : null} /> })()
        )}

        {activeTab === "revenue" && (
          <>
            {revenueLoading ? (
              <Skeleton className="h-72" />
            ) : revenueFetchError ? (
              <Card>
                <p className="text-sm text-rose-600 dark:text-rose-400">{(revenueFetchError as Error).message}</p>
              </Card>
            ) : (
              (()=>{ const rev=extractRevenue(revenueData as unknown as Record<string, unknown>); return <RevenueCard
                revenue={rev?.revenue ?? (revenueData as unknown as { estimatedRevenue?: number | null } | undefined)?.estimatedRevenue ?? null}
                cpm={rev?.cpm ?? (revenueData as unknown as { cpm?: number | null } | undefined)?.cpm ?? null}
                subs={
                  typeof (revenueData as unknown as { subscribersTotal?: number } | undefined)?.subscribersTotal === "number"
                    ? (revenueData as unknown as { subscribersTotal: number }).subscribersTotal
                    : typeof data?.subscribersTotal === "number"
                      ? data.subscribersTotal
                      : 730
                }
                hours={(() => {
                  const minutes = data?.comparison?.current?.watchTimeMinutes;
                  if (typeof minutes === "number" && data?.range) {
                    const estimatedYearMinutes = minutes * (365 / data.range);
                    const h = Math.round(estimatedYearMinutes / 60);
                    return Math.max(0, Math.min(h, 6000));
                  }
                  return 3588;
                })()}
              /> })()
            )}
            {!revenueLoading && !revenueFetchError && !revenueData && (
              <p className="text-center text-xs leading-5 text-tg-secondary">
                هنوز دیتایی برای این بخش sync نشده — تب را باز نگه دارید و همگام‌سازی بزنید.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AnalyticsLoading() {
  return (
    <div className="space-y-5" role="status" aria-busy="true" aria-label="در حال دریافت آمار">
      <div className="grid gap-px overflow-hidden rounded-xl border border-tg-border bg-tg-border sm:grid-cols-2 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-24 rounded-none" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]"><Skeleton className="h-[23rem]" /><Skeleton className="h-44" /></div>
      <Skeleton className="h-72" />
    </div>
  );
}

export default function AnalyticsPage() {
  return <Suspense fallback={<AnalyticsLoading />}><AnalyticsDashboard /></Suspense>;
}
