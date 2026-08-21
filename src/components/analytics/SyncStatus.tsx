import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { formatFreshness, type SemanticTone } from "@/lib/analytics/presentation";
import type { AnalyticsFreshness } from "@/lib/analytics/types";
import { getSyncRecoveryState } from "@/lib/analytics/dashboard-state";

const toneClasses: Record<SemanticTone, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  negative: "text-rose-700 dark:text-rose-400",
  warning: "text-amber-700 dark:text-amber-400",
  neutral: "text-tg-secondary",
};

export function SyncStatus({ freshness, syncing, syncDisabled = false, syncDisabledReason = null, onSync }: {
  freshness: AnalyticsFreshness;
  syncing: boolean;
  syncDisabled?: boolean;
  syncDisabledReason?: string | null;
  onSync: () => void;
}) {
  const status = formatFreshness(freshness.state, freshness.lastSyncedAt);
  const Icon = status.tone === "positive" ? CheckCircle2 : status.tone === "negative" ? AlertTriangle : Clock3;
  const failedAccounts = freshness.accounts.filter((account) => account.state === "error");
  const recovery = getSyncRecoveryState(failedAccounts, new Date());
  const retryDisabled = syncDisabled || recovery.retryDisabled;

  return (
    <aside className="rounded-xl border border-tg-border bg-tg-surface p-4 sm:p-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${toneClasses[status.tone]}`} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-tg-text">{status.label}</h2>
          <p className="mt-1 text-xs leading-5 text-tg-secondary">{status.description}</p>
        </div>
      </div>
      {failedAccounts.length > 0 && (
        <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-700 dark:text-rose-300">
          {recovery.message ?? `دریافت آمار برای ${formatFailedCount(failedAccounts.length)} کامل نشد. جزئیات امنیتی سرویس نمایش داده نمی‌شود؛ اتصال حساب را بررسی و دوباره تلاش کنید.`}
        </p>
      )}
      {freshness.state !== "fresh" && (
        <Button variant="secondary" size="sm" className="mt-4 min-h-11 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0" onClick={onSync} disabled={syncing || retryDisabled} title={syncDisabledReason ?? recovery.message ?? undefined}>
          <RefreshCw className={`h-3.5 w-3.5 motion-reduce:animate-none ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "در حال تلاش دوباره" : "تلاش دوباره"}
        </Button>
      )}
    </aside>
  );
}

function formatFailedCount(count: number): string {
  return `${count.toLocaleString("fa-IR")} حساب`;
}
