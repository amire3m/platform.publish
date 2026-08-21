"use client";

import useSWR from "swr";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Eye, Heart, Users, XCircle } from "lucide-react";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";

type IconType = React.ComponentType<{ className?: string }>;
import { Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui";
import { formatJalaliDateTime } from "@/lib/date/jalali";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Overview {
  syncStatus: string;
  totals: { channels: number; pages: number; followers: number; views: number; engagement: number };
  statusCounts: Record<string, number>;
  failedContents: { id: string; title: string; updatedAt: string }[];
  pendingApproval: { id: string; title: string; updatedAt: string }[];
  upcoming: { id: string; title: string; scheduledAtUtc: string }[];
  hasAnalyticsData: boolean;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: IconType }) {
  return (
    <Card className="flex items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-tg-accent-soft text-tg-accent">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs text-tg-secondary">{label}</p>
        <p className="text-xl font-bold text-tg-text">{value.toLocaleString("fa-IR")}</p>
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
  const { data, isLoading } = useSWR<{ ok: boolean; data: Overview }>("/api/analytics/overview", fetcher);
  const overview = data?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tg-text">داشبورد</h1>
        <p className="text-sm text-tg-secondary">نمای کلی وضعیت کانال‌ها، محتوا و انتشار</p>
      </div>

      {overview && overview.syncStatus !== "ok" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          وضعیت همگام‌سازی با تلگرام: <StatusBadge status={overview.syncStatus} /> — داده‌های نمایش‌داده‌شده ممکن است قدیمی باشند.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="کانال‌های یوتیوب" value={overview.totals.channels} icon={YoutubeIcon} />
          <StatCard label="پیج‌های اینستاگرام" value={overview.totals.pages} icon={InstagramIcon} />
          <StatCard label="مجموع دنبال‌کننده" value={overview.totals.followers} icon={Users} />
          <StatCard label="بازدید (۹۰ روز اخیر)" value={overview.totals.views} icon={Eye} />
          <StatCard label="تعامل" value={overview.totals.engagement} icon={Heart} />
        </div>
      )}

      {overview && !overview.hasAnalyticsData && (
        <div className="rounded-xl border border-tg-border bg-tg-hover px-4 py-3 text-xs text-tg-secondary">
          هنوز هیچ Snapshot تحلیلی ثبت نشده است. پس از اتصال رسمی حساب‌ها و اجرای همگام‌سازی، آمار واقعی این‌جا نمایش داده می‌شود (بدون داده جعلی).
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle icon={CalendarClock}>زمان‌بندی‌شده‌های نزدیک</SectionTitle>
          {overview?.upcoming?.length ? (
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
          {overview?.pendingApproval?.length ? (
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
          {overview?.failedContents?.length ? (
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
    </div>
  );
}
