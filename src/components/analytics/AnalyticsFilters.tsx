"use client";

import { Download, RefreshCw } from "lucide-react";
import { Button, Select } from "@/components/ui";
import type { AnalyticsRange } from "@/lib/analytics/types";

export type AnalyticsExportScope = "account" | "content";

export interface AnalyticsAccountOption {
  id: string;
  displayName: string;
}

export function AnalyticsFilters({
  accounts,
  accountId,
  range,
  syncing,
  syncDisabled,
  syncDisabledReason,
  accountsLoading,
  exportScope,
  canExport,
  permissionsLoading,
  csvHref,
  onAccountChange,
  onRangeChange,
  onExportScopeChange,
  onSync,
}: {
  accounts: readonly AnalyticsAccountOption[];
  accountId: string;
  range: AnalyticsRange;
  syncing: boolean;
  syncDisabled: boolean;
  syncDisabledReason: string | null;
  accountsLoading: boolean;
  exportScope: AnalyticsExportScope;
  canExport: boolean;
  permissionsLoading: boolean;
  csvHref: string;
  onAccountChange: (accountId: string) => void;
  onRangeChange: (range: AnalyticsRange) => void;
  onExportScopeChange: (scope: AnalyticsExportScope) => void;
  onSync: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-y border-tg-border py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          aria-label="حساب یوتیوب"
          value={accountId}
          onChange={(event) => onAccountChange(event.target.value)}
          disabled={accountsLoading || syncing}
          className="min-h-11 sm:min-h-0 sm:w-60"
        >
          <option value="">همه حساب‌های Emro YT</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.displayName}</option>
          ))}
        </Select>

        <div className="grid grid-cols-3 rounded-lg bg-tg-hover p-1" role="group" aria-label="بازه زمانی">
          {([7, 30, 90] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRangeChange(value)}
              disabled={syncing}
              aria-pressed={range === value}
              className={`min-h-11 rounded-md px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 ${
                range === value
                  ? "bg-tg-surface text-tg-accent shadow-sm"
                  : "text-tg-secondary hover:text-tg-text"
              }`}
            >
              {value.toLocaleString("fa-IR")} روز
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:flex sm:items-center">
        <div className="grid grid-cols-2 rounded-lg bg-tg-hover p-1" role="group" aria-label="دامنه خروجی">
          {(["account", "content"] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => onExportScopeChange(scope)}
              disabled={syncing}
              aria-pressed={exportScope === scope}
              className={`min-h-11 rounded-md px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 ${exportScope === scope ? "bg-tg-surface text-tg-accent shadow-sm" : "text-tg-secondary hover:text-tg-text"}`}
            >
              {scope === "account" ? "حساب" : "محتوا"}
            </button>
          ))}
        </div>
        <div>
          <Button
            variant="secondary"
            className="min-h-11 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0"
            onClick={onSync}
            disabled={syncing || syncDisabled}
            aria-busy={syncing}
            aria-describedby={syncDisabledReason ? "analytics-sync-disabled-reason" : undefined}
          >
            <RefreshCw className={`h-4 w-4 motion-reduce:animate-none ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "در حال همگام‌سازی" : "همگام‌سازی"}
          </Button>
          {syncDisabledReason && <p id="analytics-sync-disabled-reason" className="mt-1 max-w-56 text-xs leading-5 text-tg-secondary">{syncDisabledReason}</p>}
        </div>
        {canExport ? (
          <a href={csvHref} download className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-tg-hover px-4 py-2 text-sm font-medium text-tg-text transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent dark:hover:brightness-125 sm:min-h-0">
            <Download className="h-4 w-4" />خروجی CSV
          </a>
        ) : (
          <button type="button" disabled className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-tg-hover px-4 py-2 text-sm font-medium text-tg-secondary opacity-60 sm:min-h-0" title={permissionsLoading ? "در حال بررسی مجوز" : "مجوز خروجی داده ندارید"}>
            <Download className="h-4 w-4" />{permissionsLoading ? "بررسی مجوز" : "خروجی غیرمجاز"}
          </button>
        )}
      </div>
    </div>
  );
}
