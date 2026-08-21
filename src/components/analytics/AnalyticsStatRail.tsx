import type { SemanticTone } from "@/lib/analytics/presentation";

export interface AnalyticsStat {
  label: string;
  value: string;
  comparison?: { label: string; tone: SemanticTone };
  description?: string;
}

const toneClasses: Record<SemanticTone, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  negative: "text-rose-700 dark:text-rose-400",
  warning: "text-amber-700 dark:text-amber-400",
  neutral: "text-tg-secondary",
};

export function AnalyticsStatRail({ stats }: { stats: readonly AnalyticsStat[] }) {
  return (
    <div className="overflow-x-auto rounded-xl" tabIndex={0} aria-label="شاخص‌های آماری">
      <dl className="flex w-max snap-x snap-mandatory overflow-hidden rounded-xl border border-tg-border bg-tg-surface sm:grid sm:w-auto sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`w-[78vw] max-w-xs shrink-0 snap-start px-4 py-4 sm:w-auto sm:max-w-none sm:shrink ${index > 0 ? "border-r border-tg-border sm:border-t sm:border-r sm:border-t-0" : ""} ${index === 2 ? "sm:border-t xl:border-t-0" : ""}`}
          >
            <dt className="text-xs font-medium text-tg-secondary">{stat.label}</dt>
            <dd className="mt-1 truncate text-xl font-bold tabular-nums text-tg-text" title={stat.value}>{stat.value}</dd>
            {stat.comparison && <p className={`mt-1 text-xs font-medium ${toneClasses[stat.comparison.tone]}`}>{stat.comparison.label}</p>}
            {stat.description && <p className="mt-1 text-xs text-tg-secondary">{stat.description}</p>}
          </div>
        ))}
      </dl>
    </div>
  );
}
