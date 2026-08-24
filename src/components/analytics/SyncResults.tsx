import Link from "next/link";
import type { AccountSyncResult } from "@/lib/analytics/sync";
import { syncResultPresentation } from "./sync-result-presentation";
import { UNKNOWN_LABEL_FA } from "@/lib/presentation-fa";

const toneClasses = {
  positive: "text-emerald-700 dark:text-emerald-400",
  negative: "text-rose-700 dark:text-rose-400",
  warning: "text-amber-700 dark:text-amber-400",
  neutral: "text-tg-secondary",
};

export function SyncResults({
  results,
  error,
  accountNames = {},
}: {
  results: readonly AccountSyncResult[] | null;
  error: string | null;
  accountNames?: Readonly<Record<string, string>>;
}) {
  if (!results && !error) return null;

  return (
    <section role="status" aria-live="polite" aria-atomic="false" className="rounded-xl border border-tg-border bg-tg-surface p-4">
      <h2 className="text-sm font-bold text-tg-text">نتیجه آخرین همگام‌سازی</h2>
      {error && <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {results && results.length === 0 && <p className="mt-2 text-sm text-tg-secondary">حسابی برای همگام‌سازی پیدا نشد.</p>}
      {results && results.length > 0 && (
        <ul className="mt-3 divide-y divide-tg-border">
          {results.map((result) => {
            const presentation = syncResultPresentation(result);
            return (
              <li key={result.accountId} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,2fr)] sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-tg-text">{accountNames[result.accountId] ?? UNKNOWN_LABEL_FA}</p>
                  <p className={`mt-0.5 text-xs font-medium ${toneClasses[presentation.tone]}`}>{presentation.label}</p>
                </div>
                <div className="text-xs leading-5 text-tg-secondary">
                  <p>{presentation.action}</p>
                  {result.code === "RECONNECT_REQUIRED" && (
                    <Link href="/accounts" className="mt-2 inline-flex min-h-11 items-center font-semibold text-tg-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent sm:min-h-0">
                      رفتن به کانال‌ها
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
