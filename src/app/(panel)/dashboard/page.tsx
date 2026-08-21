"use client";

import useSWR from "swr";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock3, Eye, Heart, Users, XCircle } from "lucide-react";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";

type IconType = React.ComponentType<{ className?: string }>;
import { Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui";
import {
  formatAnalyticsNumber,
  formatFreshness,
  formatWatchMinutes,
} from "@/lib/analytics/presentation";
import { getDashboardRenderState } from "@/lib/analytics/dashboard-state";
import type { AnalyticsOverview } from "@/lib/analytics/types";
import { formatJalaliDateTime } from "@/lib/date/jalali";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Dashboard request failed");
  return response.json();
};

interface Overview extends AnalyticsOverview {
  syncStatus: string;
  totals: { channels: number; pages: number; followers: number; views: number; engagement: number };
  statusCounts: Record<string, number>;
  failedContents: { id: string; title: string; updatedAt: string }[];
  pendingApproval: { id: string; title: string; updatedAt: string }[];
  upcoming: { id: string; title: string; scheduledAtUtc: string }[];
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: IconType }) {
  return (
    <Card className="flex items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-tg-accent-soft text-tg-accent">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs text-tg-secondary">{label}</p>
        <p className="text-xl font-bold text-tg-text">{value}</p>
      </div>
    </Card>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: IconType; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-semibold text-tg-text">
      <Icon className="h-4 w-4 text-tg-secondary" />
      {children}
    </h2>
  );
}

export default function DashboardPage() {
  const { data, error, isLoading } = useSWR<{ ok: boolean; data: Overview }>(
    "/api/analytics/overview?range=90",
    fetcher,
  );
  const overview = data?.data;
  const renderState = getDashboardRenderState({
    hasOverview: overview !== undefined,
    hasError: error !== undefined,
    isLoading,
  });
  const hasSnapshotData = overview?.hasSnapshotData === true;
  const freshness = overview
    ? formatFreshness(overview.freshness.state, overview.freshness.lastSyncedAt)
    : null;
  const analyticsValue = (value: number | null | undefined) =>
    hasSnapshotData ? formatAnalyticsNumber(value, "compact") : "بدون داده";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tg-text">داشبورد</h1>
        <p className="text-sm text-tg-secondary">نمای کلی وضعیت کانال‌ها، محتوا و انتشار</p>
      </div>

      {renderState === "ready" && overview && overview.syncStatus !== "ok" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          وضعیت همگام‌سازی با تلگرام: <StatusBadge status={overview.syncStatus} /> — داده‌های نمایش‌داده‌شده ممکن است قدیمی باشند.
        </div>
      )}

      {renderState === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {renderState === "unavailable" && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-700 dark:text-rose-300" role="alert">
          دریافت نمای کلی داشبورد کامل نشد. برای مشاهده جزئیات و تلاش دوباره به{" "}
          <Link href="/analytics" className="font-semibold underline underline-offset-4">
            صفحه آمار یوتیوب
          </Link>{" "}
          بروید.
        </div>
      )}

      {renderState === "ready" && overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="کانال‌های یوتیوب" value={formatAnalyticsNumber(overview.totals.channels)} icon={YoutubeIcon} />
          <StatCard label="پیج‌های اینستاگرام" value={formatAnalyticsNumber(overview.totals.pages)} icon={InstagramIcon} />
          <StatCard label="مشترکین فعلی" value={analyticsValue(overview.subscribersTotal)} icon={Users} />
          <StatCard label="بازدید ۹۰ روزه" value={analyticsValue(overview.comparison.current.views)} icon={Eye} />
          <StatCard
            label="زمان تماشای ۹۰ روزه"
            value={hasSnapshotData ? formatWatchMinutes(overview.comparison.current.watchTimeMinutes) : "بدون داده"}
            icon={Clock3}
          />
          <StatCard
            label="نرخ تعامل ۹۰ روزه"
            value={hasSnapshotData ? `${formatAnalyticsNumber(overview.comparison.current.engagementRate)}٪` : "بدون داده"}
            icon={Heart}
          />
        </div>
      )}

      {renderState === "ready" && overview && freshness && (
        <aside
          className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
            freshness.tone === "negative"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : freshness.tone === "warning"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-tg-border bg-tg-surface text-tg-secondary"
          }`}
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-current">{freshness.label}</p>
              <p className="text-xs leading-5 text-current opacity-90">
                {!hasSnapshotData
                  ? "هنوز Snapshot تحلیلی ثبت نشده است؛ آمار جعلی نمایش داده نمی‌شود."
                  : freshness.description}
              </p>
            </div>
            <Link
              href="/analytics"
              className="shrink-0 rounded-lg px-2 py-1 font-semibold text-tg-accent hover:bg-tg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tg-accent"
            >
              جزئیات و بازیابی
            </Link>
          </div>
        </aside>
      )}

      {renderState === "ready" && overview && (
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle icon={CalendarClock}>زمان‌بندی‌شده‌های نزدیک</SectionTitle>
          {overview.upcoming.length ? (
            <ul className="space-y-2 text-sm">
              {overview.upcoming.map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b border-dashed border-tg-border pb-2 last:border-0">
                  <Link href={`/content/${c.id}`} className="text-tg-accent hover:underline">
                    {c.title || c.id}
                  </Link>
                  <span className="text-xs text-tg-secondary">{formatJalaliDateTime(c.scheduledAtUtc)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="چیزی زمان‌بندی نشده" />
          )}
        </Card>

        <Card>
          <SectionTitle icon={CheckCircle2}>در انتظار تأیید</SectionTitle>
          {overview.pendingApproval.length ? (
            <ul className="space-y-2 text-sm">
              {overview.pendingApproval.map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b border-dashed border-tg-border pb-2 last:border-0">
                  <Link href={`/content/${c.id}`} className="text-tg-accent hover:underline">
                    {c.title || c.id}
                  </Link>
                  <StatusBadge status="pending" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="چیزی در انتظار تأیید نیست" />
          )}
        </Card>

        <Card>
          <SectionTitle icon={XCircle}>محتوای ناموفق</SectionTitle>
          {overview.failedContents.length ? (
            <ul className="space-y-2 text-sm">
              {overview.failedContents.map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b border-dashed border-tg-border pb-2 last:border-0">
                  <Link href={`/content/${c.id}`} className="text-tg-accent hover:underline">
                    {c.title || c.id}
                  </Link>
                  <StatusBadge status="failed" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="هیچ خطایی ثبت نشده" />
          )}
        </Card>
      </div>
      )}
    </div>
  );
}
