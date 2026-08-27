"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle, BarChart3, Clock3, Eye, Mail, Package, TrendingUp, XCircle } from "lucide-react";
import { Card, EmptyState, ErrorState, Select, Skeleton } from "@/components/ui";
import { fetchWorkflowApi } from "@/lib/workflow/client";
import { CHANNELS, getChannelLabelFa } from "@/lib/channels";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";
import { platformLabelFa, statusLabelFa, UNKNOWN_LABEL_FA } from "@/lib/presentation-fa";
import { MAIN_REPORT_ALIAS } from "@/lib/accounts/organization";
import { ChannelHeader } from "@/components/analytics/ChannelHeader";
import type { PublicAccountDto } from "@/lib/accounts/public";

type IconType = React.ComponentType<{ className?: string }>;

interface DashboardSummary {
  kpis: {
    contentProductsTotal: number;
    contentProductsOverdue: number;
    programsTotal: number;
    deliverablesTotal: number;
    publicationsTotal: number;
    publicationsFailed: number;
    progress: { percent: number; completedUnits: number; totalUnits: number; empty: boolean; complete: boolean } | null;
  };
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  byProductType: Record<string, number>;
  attention: {
    overdueProducts: Array<{ id: string; title: string; dueAt: string | null; status: string }>;
    overdueCount: number;
    failedPublications: Array<{ id: string; platform: string; deliverableId: string }>;
    failedCount: number;
  };
  teamWorkload: Array<{ userId: string; name: string | null; assignedContents: number; assignedDeliverables: number; overdue: number }>;
  mailUnread: { info: number; support: number; total: number };
  youtube: { totalViews30d: number; byChannel: Array<{ channelId: string; label: string; views: number }>; topVideos: Array<{ videoId: string; title: string; views: number; channel: string; channelId?: string }> };
  instagram: { status: "awaiting_connection" | "connected"; byPage: Array<{ pageId: string; label: string; views: number }>; connectedCount: number };
}

const STATUS_LABELS_FA: Record<string, string> = {
  imported: "وارد شده",
  editing_youtube: "تدوین یوتیوب",
  copyright_fix: "اصلاح کپی‌رایت",
  highlight_done: "هایلایت آماده",
  reel_done: "ریل آماده",
  cover_ready: "کاور آماده",
  ready_to_send: "آماده ارسال",
};

const STATUS_ORDER = ["imported", "editing_youtube", "copyright_fix", "highlight_done", "reel_done", "cover_ready", "ready_to_send"] as const;

function KpiCard({ label, value, sub, icon: Icon, tone }: { label: string; value: string | number; sub?: string; icon: IconType; tone?: string }) {
  return (
    <div role="group" aria-label={label}>
      <Card className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone ?? "bg-tg-accent-soft text-tg-accent"}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs text-tg-secondary">{label}</p>
          <p className="text-xl font-bold text-tg-text">{value}</p>
          {sub && <p className="text-[11px] text-tg-secondary">{sub}</p>}
        </div>
      </Card>
    </div>
  );
}

function BarChart({ title, data, labels, ariaLabel }: { title: string; data: Record<string, number>; labels: Record<string, string>; ariaLabel: string }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-tg-text" id={`${ariaLabel}-heading`}>
        <BarChart3 className="h-4 w-4 text-tg-secondary" aria-hidden="true" />
        {title}
      </h2>
      <div role="img" aria-labelledby={`${ariaLabel}-heading`} aria-label={`${title} - ${entries.length} مورد`}>
        <ul className="space-y-3" aria-label={title}>
          {entries.map(([key, value]) => {
            const pct = Math.round((value / max) * 100);
            return (
              <li key={key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                   <span className="font-medium text-tg-text">{labels[key] ?? statusLabelFa(key)}</span>
                   <span className="text-tg-secondary" aria-label={`${labels[key] ?? statusLabelFa(key)} ${value} مورد`}>{value}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-tg-hover" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={`${labels[key] ?? statusLabelFa(key)}: ${value}`}>
                  <div className="h-2 rounded-full bg-tg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const accountId = searchParams.get("accountId") ?? "";

  const { data: accountRecords } = useSWR<PublicAccountDto[]>("/api/accounts", fetchWorkflowApi<PublicAccountDto[]>);
  const accounts = (accountRecords ?? []).filter((a) => a.platform === "youtube" && a.organization === "emro" && a.active && a.connectionStatus === "connected");
  const selected = accountId ? accounts.find((a) => a.id === accountId) ?? null : null;

  const summaryUrl = accountId ? `/api/dashboard/summary?accountId=${accountId}` : "/api/dashboard/summary";
  const { data, error, isLoading } = useSWR<DashboardSummary>(summaryUrl, fetchWorkflowApi<DashboardSummary>);

  function handleAccountChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("accountId", value);
    else params.delete("accountId");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  if (isLoading) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-xl font-bold text-tg-text">داشبورد</h1>
          <p className="text-sm text-tg-secondary">نمای کلی وضعیت محتوا، انتشار و تیم</p>
        </div>
        <Select aria-label="حساب یوتیوب" value={accountId} onChange={(e) => handleAccountChange(e.target.value)} className="sm:w-64">
          <option value="">همه حساب‌های Emro YT</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.displayName}</option>
          ))}
        </Select>
        <ChannelHeader
          account={selected ? { id: selected.id, displayName: selected.displayName, username: selected.username, profileImage: selected.profileImage, externalAccountId: (selected as unknown as { externalAccountId?: string | null }).externalAccountId ?? null } : null}
          isAggregated={!accountId}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-busy="true" aria-label="در حال بارگذاری">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    const msg = (error as Error).message ?? "خطا در دریافت داشبورد";
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-xl font-bold text-tg-text">داشبورد</h1>
          <p className="text-sm text-tg-secondary">نمای کلی وضعیت محتوا، انتشار و تیم</p>
        </div>
        <Select aria-label="حساب یوتیوب" value={accountId} onChange={(e) => handleAccountChange(e.target.value)} className="sm:w-64">
          <option value="">همه حساب‌های Emro YT</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.displayName}</option>
          ))}
        </Select>
        <ChannelHeader
          account={selected ? { id: selected.id, displayName: selected.displayName, username: selected.username, profileImage: selected.profileImage, externalAccountId: (selected as unknown as { externalAccountId?: string | null }).externalAccountId ?? null } : null}
          isAggregated={!accountId}
        />
        <ErrorState message={msg} />
        <p className="text-sm text-tg-secondary">
          لطفاً صفحه را تازه‌سازی کنید یا به{" "}
          <Link href="/content-room" className="text-tg-accent underline">اتاق محتوا</Link> بروید.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-xl font-bold text-tg-text">داشبورد</h1>
          <p className="text-sm text-tg-secondary">نمای کلی وضعیت محتوا، انتشار و تیم</p>
        </div>
        <Select aria-label="حساب یوتیوب" value={accountId} onChange={(e) => handleAccountChange(e.target.value)} className="sm:w-64">
          <option value="">همه حساب‌های Emro YT</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.displayName}</option>
          ))}
        </Select>
        <ChannelHeader
          account={selected ? { id: selected.id, displayName: selected.displayName, username: selected.username, profileImage: selected.profileImage, externalAccountId: (selected as unknown as { externalAccountId?: string | null }).externalAccountId ?? null } : null}
          isAggregated={!accountId}
        />
        <EmptyState title="داده‌ای برای نمایش وجود ندارد" description="هنوز محتوایی ثبت نشده است." />
      </div>
    );
  }

  const isEmpty = data.kpis.contentProductsTotal === 0 && data.kpis.programsTotal === 0 && data.kpis.deliverablesTotal === 0;
  const avgProgress = data.kpis.progress?.percent ?? 0;

  const orderedByStatus: Record<string, number> = {};
  for (const s of STATUS_ORDER) orderedByStatus[s] = data.byStatus[s] ?? 0;
  for (const [k, v] of Object.entries(data.byStatus)) if (!(k in orderedByStatus)) orderedByStatus[k] = v;

  const channelLabels: Record<string, string> = {};
  for (const c of CHANNELS) channelLabels[c.id] = getChannelLabelFa(c.id);
  const orderedByChannel: Record<string, number> = {};
  for (const c of CHANNELS) orderedByChannel[c.id] = data.byChannel[c.id] ?? 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-tg-text">داشبورد</h1>
        <p className="text-sm text-tg-secondary">نمای کلی وضعیت محتوا، انتشار و تیم — بروزرسانی لحظه‌ای</p>
      </div>

      <Select
        aria-label="حساب یوتیوب"
        value={accountId}
        onChange={(e) => handleAccountChange(e.target.value)}
        className="sm:w-64"
      >
        <option value="">همه حساب‌های Emro YT</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.displayName}</option>
        ))}
      </Select>

      <ChannelHeader
        account={selected ? { id: selected.id, displayName: selected.displayName, username: selected.username, profileImage: selected.profileImage, externalAccountId: (selected as unknown as { externalAccountId?: string | null }).externalAccountId ?? null } : null}
        isAggregated={!accountId}
      />

      {isEmpty ? <EmptyState title="داده‌ای برای نمایش وجود ندارد" description="هنوز محتوایی ثبت نشده است. از اتاق محتوا شروع کنید." action={<Link href="/content-room" className="text-tg-accent text-sm underline">رفتن به اتاق محتوا</Link>} /> : null}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" role="region" aria-label="شاخص‌های کلیدی">
        <KpiCard label="مجموع محصولات" value={data.kpis.contentProductsTotal} icon={Package} />
        <KpiCard label="میانگین پیشرفت" value={`${avgProgress}٪`} sub={data.kpis.progress?.empty ? "بدون خروجی" : `${data.kpis.progress?.completedUnits ?? 0}/${data.kpis.progress?.totalUnits ?? 0}`} icon={TrendingUp} />
        <KpiCard label="محتوای معوق" value={data.kpis.contentProductsOverdue} icon={Clock3} tone={data.kpis.contentProductsOverdue > 0 ? "bg-amber-500/15 text-amber-600" : "bg-tg-accent-soft text-tg-accent"} />
        <KpiCard label="انتشار ناموفق" value={data.kpis.publicationsFailed} icon={XCircle} tone={data.kpis.publicationsFailed > 0 ? "bg-rose-500/15 text-rose-600" : "bg-tg-accent-soft text-tg-accent"} />
        <KpiCard label="پیام‌های نخوانده" value={data.mailUnread.total} sub={`info: ${data.mailUnread.info} · support: ${data.mailUnread.support}`} icon={Mail} />
      </div>

      {/* Bar charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart title="توزیع وضعیت (۷)" data={orderedByStatus} labels={STATUS_LABELS_FA} ariaLabel="byStatus" />
        <BarChart title="توزیع کانال (۶)" data={orderedByChannel} labels={channelLabels} ariaLabel="byChannel" />
      </div>

      {/* Attention table */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-tg-text">
          <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
          نیازمند توجه
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-tg-text">محتوای معوق ({data.attention.overdueCount})</h3>
            {data.attention.overdueProducts.length ? (
              <div className="overflow-x-auto rounded-lg border border-tg-border">
                <table className="w-full text-sm" aria-label="جدول محتوای معوق">
                  <thead className="bg-tg-hover text-right text-xs text-tg-secondary">
                    <tr>
                      <th className="p-2.5 font-semibold">عنوان</th>
                      <th className="p-2.5 font-semibold">وضعیت</th>
                      <th className="p-2.5 font-semibold">مهلت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attention.overdueProducts.map((p) => (
                      <tr key={p.id} className="border-t border-tg-border">
                        <td className="p-2.5">
                          <Link href={`/content-room/${p.id}`} className="text-tg-accent hover:underline">
                            {p.title || p.id}
                          </Link>
                        </td>
                         <td className="p-2.5 text-xs">{STATUS_LABELS_FA[p.status] ?? statusLabelFa(p.status)}</td>
                        <td className="p-2.5 text-xs text-tg-secondary">{p.dueAt ? formatJalaliDateTime(p.dueAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-tg-border p-4 text-center text-sm text-tg-secondary">مورد معوقی یافت نشد.</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-tg-text">انتشارهای ناموفق ({data.attention.failedCount})</h3>
            {data.attention.failedPublications.length ? (
              <div className="overflow-x-auto rounded-lg border border-tg-border">
                <table className="w-full text-sm" aria-label="جدول انتشارهای ناموفق">
                  <thead className="bg-tg-hover text-right text-xs text-tg-secondary">
                    <tr>
                      <th className="p-2.5 font-semibold">شناسه انتشار</th>
                      <th className="p-2.5 font-semibold">پلتفرم</th>
                      <th className="p-2.5 font-semibold">خروجی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attention.failedPublications.map((f) => (
                      <tr key={f.id} className="border-t border-tg-border">
                        <td className="p-2.5 font-mono text-xs">{f.id}</td>
                         <td className="p-2.5 text-xs">{platformLabelFa(f.platform)}</td>
                        <td className="p-2.5 font-mono text-xs text-tg-secondary">{f.deliverableId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-tg-border p-4 text-center text-sm text-tg-secondary">مورد ناموفقی یافت نشد.</p>
            )}
          </div>
        </div>
      </Card>

      {/* YouTube 30d */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-tg-text">
          <YoutubeIcon className="h-4 w-4 text-rose-500" aria-hidden="true" />
          گزارش YouTube {MAIN_REPORT_ALIAS} در ۳۰ روز گذشته
          <span className="ms-auto text-sm font-bold text-tg-text">{(data.youtube?.totalViews30d ?? 0).toLocaleString("fa-IR")} بازدید</span>
        </h2>
        {data.youtube?.byChannel?.length ? (
          <div role="img" aria-label="بازدید یوتیوب به تفکیک کانال">
            <ul className="space-y-3" aria-label="بازدید یوتیوب به تفکیک کانال">
              {(() => {
                const max = Math.max(1, ...data.youtube.byChannel.map((c) => c.views));
                return data.youtube.byChannel.map((c) => {
                  const pct = Math.round((c.views / max) * 100);
                  return (
                    <li key={c.channelId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-tg-text">{c.label}</span>
                        <span className="text-tg-secondary" aria-label={`${c.label} ${c.views} بازدید`}>{c.views.toLocaleString("fa-IR")}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-tg-hover" role="progressbar" aria-valuenow={c.views} aria-valuemin={0} aria-valuemax={max} aria-label={`${c.label}: ${c.views}`}>
                        <div className="h-2 rounded-full bg-rose-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                });
              })()}
            </ul>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-tg-border p-4 text-center text-sm text-tg-secondary">داده بازدید ۳۰ روزه موجود نیست.</p>
        )}
      </Card>

      {/* Top videos */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-tg-text">
          <Eye className="h-4 w-4 text-tg-secondary" aria-hidden="true" />
          ویدیوهای برتر {MAIN_REPORT_ALIAS}
        </h2>
        {data.youtube?.topVideos?.length ? (
          <div className="overflow-x-auto rounded-lg border border-tg-border">
            <table className="w-full text-sm" aria-label="جدول تاپ ویدیوها">
              <thead className="bg-tg-hover text-right text-xs text-tg-secondary">
                <tr>
                  <th scope="col" className="p-2.5 font-semibold">ویدیو</th>
                  <th scope="col" className="p-2.5 font-semibold">کانال</th>
                  <th scope="col" className="p-2.5 font-semibold">بازدید</th>
                </tr>
              </thead>
              <tbody>
                {data.youtube.topVideos.map((v) => (
                  <tr key={v.videoId} className="border-t border-tg-border">
                    <td className="p-2.5">
                       <span className="font-medium text-tg-text">{v.title || UNKNOWN_LABEL_FA}</span>
                      <span className="block font-mono text-[11px] text-tg-secondary">{v.videoId}</span>
                    </td>
                    <td className="p-2.5 text-xs text-tg-secondary">{v.channel || (v.channelId ? UNKNOWN_LABEL_FA : "—")}</td>
                    <td className="p-2.5 text-center font-semibold text-tg-text">{v.views.toLocaleString("fa-IR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-tg-border p-4 text-center text-sm text-tg-secondary">ویدیویی برای نمایش وجود ندارد.</p>
        )}
      </Card>

      {/* Instagram placeholder */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-tg-text">
          <InstagramIcon className="h-4 w-4 text-pink-500" aria-hidden="true" />
          گزارش Instagram {MAIN_REPORT_ALIAS}
        </h2>
        {data.instagram?.status === "awaiting_connection" || (data.instagram?.connectedCount ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed border-tg-border p-6 text-center">
            <p className="text-sm text-tg-secondary">هنوز حساب Instagram موسسه امام روح‌الله متصل و تعیین نشده است.</p>
            <p className="mt-1 text-xs text-tg-secondary">حساب را متصل کنید و وابستگی آن را در صفحه حساب‌ها روی «موسسه امام روح‌الله» قرار دهید.</p>
            <Link href="/settings/instagram" className="mt-3 inline-flex text-sm text-tg-accent underline">
              رفتن به تنظیمات اینستاگرام
            </Link>
          </div>
        ) : data.instagram?.byPage?.length ? (
          <div role="img" aria-label="بازدید اینستاگرام به تفکیک پیج">
            <ul className="space-y-3">
              {(() => {
                const max = Math.max(1, ...data.instagram.byPage.map((p) => p.views));
                return data.instagram.byPage.map((p) => {
                  const pct = Math.round((p.views / max) * 100);
                  return (
                    <li key={p.pageId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-tg-text">{p.label}</span>
                        <span className="text-tg-secondary">{p.views.toLocaleString("fa-IR")}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-tg-hover" role="progressbar" aria-valuenow={p.views} aria-valuemin={0} aria-valuemax={max} aria-label={`${p.label}: ${p.views}`}>
                        <div className="h-2 rounded-full bg-pink-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                });
              })()}
            </ul>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-tg-border p-4 text-center text-sm text-tg-secondary">داده‌ای برای نمایش وجود ندارد.</p>
        )}
      </Card>

      {/* Team workload table */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-tg-text">کارکرد تیم</h2>
        {data.teamWorkload.length ? (
          <div className="overflow-x-auto rounded-lg border border-tg-border">
            <table className="w-full text-sm" aria-label="جدول کارکرد تیم">
              <thead className="bg-tg-hover text-right text-xs text-tg-secondary">
                <tr>
                  <th scope="col" className="p-2.5 font-semibold">کاربر</th>
                  <th scope="col" className="p-2.5 font-semibold">محتوای محول</th>
                  <th scope="col" className="p-2.5 font-semibold">خروجی‌های محول</th>
                  <th scope="col" className="p-2.5 font-semibold">معوق</th>
                </tr>
              </thead>
              <tbody>
                {data.teamWorkload.map((w) => (
                  <tr key={w.userId} className="border-t border-tg-border">
                    <td className="p-2.5 font-medium text-tg-text">{w.name ?? UNKNOWN_LABEL_FA}</td>
                    <td className="p-2.5 text-center">{w.assignedContents}</td>
                    <td className="p-2.5 text-center">{w.assignedDeliverables}</td>
                    <td className={`p-2.5 text-center font-semibold ${w.overdue > 0 ? "text-amber-600" : "text-tg-secondary"}`}>{w.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="کارکردی ثبت نشده" />
        )}
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="space-y-6" dir="rtl"><Skeleton className="h-24" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
