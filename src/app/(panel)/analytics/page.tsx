"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate as mutateCache } from "swr";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { AnalyticsFilters, type AnalyticsAccountOption, type AnalyticsExportScope } from "@/components/analytics/AnalyticsFilters";
import { AnalyticsStatRail, type AnalyticsStat } from "@/components/analytics/AnalyticsStatRail";
import { AnalyticsTrendChart } from "@/components/analytics/AnalyticsTrendChart";
import { SyncStatus } from "@/components/analytics/SyncStatus";
import { SyncResults } from "@/components/analytics/SyncResults";
import { TopVideos } from "@/components/analytics/TopVideos";
import { useToast } from "@/components/providers";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import { formatAnalyticsNumber, formatComparison, formatWatchMinutes } from "@/lib/analytics/presentation";
import { analyticsFilterKey, analyticsFiltersChanged, buildAnalyticsSyncRequest, createRequestGenerationGuard } from "@/lib/analytics/analytics-controls";
import { runAnalyticsSync } from "@/lib/analytics/sync-controller";
import type { PublicAccountDto } from "@/lib/accounts/public";
import type { AnalyticsOverview, AnalyticsRange, MetricTotals } from "@/lib/analytics/types";
import type { AccountSyncResult } from "@/lib/analytics/sync";
import { MAIN_REPORT_ALIAS } from "@/lib/accounts/organization";

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

function AnalyticsDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const range = selectedRange(searchParams.get("range"));
  const accountId = searchParams.get("accountId") ?? "";
  const exportScope = selectedExportScope(searchParams.get("scope"));
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<AccountSyncResult[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncFeedbackFilterKey, setSyncFeedbackFilterKey] = useState<string | null>(null);
  const [syncGeneration] = useState(createRequestGenerationGuard);
  const requestUrl = overviewUrl(range, accountId);
  const { data, error, isLoading, mutate } = useSWR<AnalyticsOverview>(requestUrl, fetchApi);
  const { data: accountRecords, error: accountsError, isLoading: accountsLoading, mutate: mutateAccounts } = useSWR<AccountRecord[]>("/api/accounts", fetchApi);
  const { data: me, isLoading: permissionsLoading } = useSWR<{ permissions: string[]; allowedAccountIds: string[] | null }>("/api/auth/me", fetchApi);
  const accounts = (accountRecords ?? [])
    .filter((account) => account.platform === "youtube" && account.organization === "emro" && account.active && account.connectionStatus === "connected")
    .map((account) => ({ ...account, displayName: MAIN_REPORT_ALIAS }));
  const currentFilterState = { accountId, range, scope: exportScope } as const;
  const currentFilterKey = analyticsFilterKey(currentFilterState);
  const previousFilterKey = useRef(currentFilterKey);
  const syncRequest = buildAnalyticsSyncRequest(accountId, me?.permissions ?? [], me?.allowedAccountIds);

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
      revalidateOverview: mutate,
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

      {isLoading && <AnalyticsLoading />}

      {!isLoading && error && (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-700 dark:text-rose-300">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><h2 className="font-bold">آمار دریافت نشد</h2><p className="mt-1 text-sm">{error.message}</p></div>
          </div>
          <Button variant="secondary" size="sm" className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0" onClick={() => mutate()}><RotateCcw className="h-4 w-4" />تلاش دوباره</Button>
        </div>
      )}

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
            <SyncStatus freshness={data.freshness} syncing={syncing} syncDisabled={!syncRequest.allowed} syncDisabledReason={syncRequest.reason} onSync={syncAnalytics} />
          </div>
          <TopVideos videos={data.topVideos} accountId={accountId} range={range} exportScope={exportScope} />
        </>
      ) : null}
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
