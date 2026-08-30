import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui";
import { formatFreshness, formatComparison, type SemanticTone } from "@/lib/analytics/presentation";
import type { AnalyticsFreshness } from "@/lib/analytics/types";
import { getSyncRecoveryState } from "@/lib/analytics/dashboard-state";
import { formatJalaliDateTime } from "@/lib/date/jalali";

const toneClasses: Record<SemanticTone, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  negative: "text-rose-700 dark:text-rose-400",
  warning: "text-amber-700 dark:text-amber-400",
  neutral: "text-tg-secondary",
};

export function SyncStatus({ freshness, syncing, syncDisabled = false, syncDisabledReason = null, onSync, bestPublishTime = null, comparison = null }: {
  freshness: AnalyticsFreshness;
  syncing: boolean;
  syncDisabled?: boolean;
  syncDisabledReason?: string | null;
  onSync: () => void;
  bestPublishTime?: string | null;
  comparison?: Record<string, number | null> | null;
}) {
  const status = formatFreshness(freshness.state, freshness.lastSyncedAt);
  const Icon = status.tone === "positive" ? CheckCircle2 : status.tone === "negative" ? AlertTriangle : Clock3;
  const failedAccounts = freshness.accounts.filter((account) => account.state === "error");
  const recovery = getSyncRecoveryState(failedAccounts, new Date());
  const retryDisabled = syncDisabled || recovery.retryDisabled;
  const quotaAccount = failedAccounts.find((a) => a.lastErrorCode === "QUOTA_EXHAUSTED");
  const reconnectAccount = failedAccounts.find((a) => a.lastErrorCode === "RECONNECT_REQUIRED");

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
        <div className="mt-3 space-y-2">
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-700 dark:text-rose-300">
            {recovery.message ?? `دریافت آمار برای ${formatFailedCount(failedAccounts.length)} کامل نشد. جزئیات امنیتی سرویس نمایش داده نمی‌شود؛ اتصال حساب را بررسی و دوباره تلاش کنید.`}
          </p>
          {quotaAccount && quotaAccount.nextAttemptAt && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
              سهمیه به پایان رسیده — تلاش بعدی: {formatJalaliDateTime(quotaAccount.nextAttemptAt as string | Date, { withWeekday: false })}
            </p>
          )}
          {reconnectAccount && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
              اتصال حساب یوتیوب منقضی شده — لطفاً در تنظیمات اتصال را بازسازی کنید.
            </p>
          )}
        </div>
      )}
      {bestPublishTime && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-tg-border bg-tg-hover/40 px-3 py-2.5">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-tg-text">بهترین زمان انتشار پیشنهادی</p>
            <p className="mt-1 text-xs leading-5 text-tg-secondary" dir="ltr">{bestPublishTime} (Asia/Tehran)</p>
            <p className="mt-1 text-[11px] leading-4 text-tg-secondary">بر اساس بیشترین بازدید روزهای اخیر — مقایسه دوره با {comparison ? formatComparison(comparison.views).label : "داده مقایسه‌ای"} </p>
          </div>
        </div>
      )}
      {comparison && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(comparison).slice(0,4).map(([k, v]) => {
            const c=formatComparison(v);
            return <div key={k} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${c.tone==="positive"?"bg-emerald-500/10 text-emerald-700 dark:text-emerald-400":c.tone==="negative"?"bg-rose-500/10 text-rose-700 dark:text-rose-300":"bg-tg-hover text-tg-secondary"}`}>{k}: {c.label}</div>
          })}
        </div>
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
