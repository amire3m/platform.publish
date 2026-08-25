"use client";

import { Card, EmptyState } from "@/components/ui";
import { calculateMonetizationProgress } from "@/lib/analytics/monetization";
import { formatAnalyticsNumber } from "@/lib/analytics/presentation";
import { toPersianDigits } from "@/lib/date/jalali";

export interface RevenueCardProps {
  revenue: number | null;
  cpm: number | null;
  subs: number;
  hours: number;
}

function ProgressBar({ label, value, progress }: { label: string; value: string; progress: number }) {
  const pct = Math.round(progress * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-tg-text">{label}</span>
        <span className="text-tg-secondary" dir="ltr">
          {toPersianDigits(pct)}٪
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-tg-border"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-tg-accent transition-all"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <p className="text-[11px] text-tg-secondary">{value}</p>
    </div>
  );
}

export function RevenueCard({ revenue, cpm, subs, hours }: RevenueCardProps) {
  const progress = calculateMonetizationProgress(subs, hours);
  const { subsProgress, hoursProgress, remainingSubs, remainingHours, isEligible } = progress;

  const hasRevenue = revenue !== null && revenue !== undefined;
  const formattedRevenue =
    hasRevenue && typeof revenue === "number" ? `$${formatAnalyticsNumber(revenue)}` : null;
  const formattedCpm = cpm !== null && cpm !== undefined ? `$${formatAnalyticsNumber(cpm)}` : null;

  // Remaining distance text — example for 730/3588 => "۲۷۰ مشترک و ۴۱۲ ساعت تا واجد شرایط"
  const remainingText = isEligible
    ? "واجد شرایط دریافت درآمد هستید — تبریک!"
    : `${toPersianDigits(remainingSubs)} مشترک و ${toPersianDigits(remainingHours)} ساعت تا واجد شرایط`;

  return (
    <Card className="space-y-5">
      <div>
        <h3 className="font-bold text-tg-text">درآمد</h3>
        <p className="mt-1 text-xs leading-5 text-tg-secondary">
          نمایش درآمد تخمینی و CPM در کنار فاصله تا واجد شرایط شدن مانیتایز
        </p>
      </div>

      {/* Revenue section */}
      {hasRevenue ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-tg-border bg-tg-hover/40 p-4">
              <p className="text-xs font-medium text-tg-secondary">درآمد تخمینی</p>
              <p className="mt-1 text-lg font-bold text-tg-text" dir="ltr">
                {formattedRevenue}
              </p>
              <p className="mt-1 text-[11px] text-tg-secondary">estimatedRevenue</p>
            </div>
            <div className="rounded-xl border border-tg-border bg-tg-hover/40 p-4">
              <p className="text-xs font-medium text-tg-secondary">CPM</p>
              <p className="mt-1 text-lg font-bold text-tg-text" dir="ltr">
                {formattedCpm ?? "—"}
              </p>
              <p className="mt-1 text-[11px] text-tg-secondary">میانگین به‌ازای هزار نمایش</p>
            </div>
          </div>
          {/* revenue line chart placeholder — values are available, chart will be added with time dimension */}
          <div
            className="rounded-lg border border-dashed border-tg-border bg-tg-hover/30 px-4 py-4 text-center text-xs leading-5 text-tg-secondary"
            aria-label="نمودار درآمد"
          >
            نمودار روند درآمد (placeholder) — با داده سری زمانی تکمیل می‌شود
            <span className="mt-1 block text-[11px] opacity-70" dir="ltr">
              revenue: {formattedRevenue} · CPM: {formattedCpm ?? "—"}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="font-semibold text-amber-800 dark:text-amber-300">هنوز مانیتایز نشده</p>
          <p className="mt-1 text-sm leading-6 text-amber-800/80 dark:text-amber-300/80">
            این کانال هنوز به درآمدزایی نرسیده است. پس از فعال‌سازی مانیتایز، درآمد و CPM اینجا نمایش داده می‌شود.
          </p>
        </div>
      )}

      {/* Monetization progress — always shown */}
      <div className="space-y-3 rounded-xl border border-tg-border bg-tg-hover/30 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-tg-text">فاصله تا مانیتایز</h4>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              isEligible ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            }`}
          >
            {isEligible ? "واجد شرایط" : "در مسیر"}
          </span>
        </div>

        <p className="text-sm leading-6 text-tg-secondary">{remainingText}</p>

        <ProgressBar
          label="مشترک‌ها"
          value={`${toPersianDigits(subs)} از ۱٬۰۰۰ · مانده ${toPersianDigits(remainingSubs)} مشترک`}
          progress={subsProgress}
        />
        <ProgressBar
          label="ساعت تماشا (۱۲ ماه اخیر)"
          value={`${toPersianDigits(Math.round(hours))} از ۴٬۰۰۰ · مانده ${toPersianDigits(remainingHours)} ساعت`}
          progress={hoursProgress}
        />

        {!isEligible && (
          <p className="text-xs leading-5 text-tg-secondary">
            برای واجد شرایط شدن، کانال باید حداقل ۱٬۰۰۰ مشترک و ۴٬۰۰۰ ساعت تماشا در ۱۲ ماه اخیر داشته باشد.
          </p>
        )}
      </div>

      {!hasRevenue && !isEligible && (
        <EmptyState
          title="درآمد فعلاً در دسترس نیست"
          description="پس از مانیتایز، نمودار درآمد و جزئیات CPM اینجا نمایش داده می‌شود. پیشرفت بالا بر اساس مشترک‌ها و ساعت تماشا محاسبه شده است."
        />
      )}
    </Card>
  );
}
