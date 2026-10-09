"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CheckCircle2, Clock3, ExternalLink, ListTodo, Send } from "lucide-react";
import { Button, Card, EmptyState, Select, Skeleton } from "@/components/ui";
import { fetchWorkflowApi } from "@/lib/workflow/client";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import { JOB_FUNCTION_LABELS_FA, type JobFunction } from "@/lib/job-functions";

interface ChecklistTask {
  kind: "checklist";
  job: JobFunction;
  jobLabel: string;
  activity: string;
  activityLabel: string;
  partId: string;
  productId: string;
  productTitle: string;
  channel: string;
  channelLabel: string;
  partNumber: number;
  remainingForJob: number;
  href: string;
}

interface PublicationTask {
  id: string;
  platform: string;
  status: string;
  scheduledAt: string | null;
  programId: string;
  programTitle: string;
  deliverableName: string;
  deliverableKind: string | null;
  href: string;
}

interface TodayPerson {
  userId: string;
  name: string;
  count: number;
}

interface AssetCoverTask {
  kind: "asset_cover";
  assetId: string;
  assetKind: string;
  assetLabel: string;
  partId: string;
  productId: string;
  productTitle: string;
  channel: string;
  channelLabel: string;
  partNumber: number;
  href: string;
}

interface TasksResponse {
  jobs: JobFunction[];
  isAdmin: boolean;
  checklist: ChecklistTask[];
  assetCovers: AssetCoverTask[];
  publications: PublicationTask[];
  today: TodayPerson[];
  todayTotal: number;
}

interface NameRow {
  id: string;
  name: string;
  jobFunctions?: string[];
}

const PUB_STATUS_FA: Record<string, string> = {
  ready: "آماده انتشار",
  failed: "ناموفق",
  scheduled: "زمان‌بندی‌شده",
  waiting_for_production: "منتظر تولید",
};

function JobSection({ job, tasks, assetTasks }: { job: JobFunction; tasks: ChecklistTask[]; assetTasks?: AssetCoverTask[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [doneAssets, setDoneAssets] = useState<Record<string, boolean>>({});
  const visible = tasks.filter((t) => !done[`${t.partId}:${t.activity}`]);
  const visibleAssets = (assetTasks ?? []).filter((t) => !doneAssets[t.assetId]);
  const total = visible.length + visibleAssets.length;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-tg-border flex items-center justify-between">
        <h2 className="font-semibold text-tg-text flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-tg-accent" />
          {JOB_FUNCTION_LABELS_FA[job]}
        </h2>
        <span className="text-xs text-tg-secondary">{total} کار باز</span>
      </div>
      {total === 0 ? (
        <p className="p-4 text-sm text-tg-secondary flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          چیزی برای این سمت باقی نمانده است.
        </p>
      ) : (
        <ul className="divide-y divide-tg-border">
          {visibleAssets.map((t) => (
            <li key={t.assetId} className="p-3 flex items-center gap-3 bg-amber-500/5">
              <input
                type="checkbox"
                checked={false}
                onChange={() => setDoneAssets((d) => ({ ...d, [t.assetId]: true }))}
                title="پنهان‌کردن موقت از این فهرست"
                aria-label={`پنهان‌کردن ${t.assetLabel}`}
                className="h-4 w-4 shrink-0 rounded border-tg-border text-tg-accent focus:ring-tg-accent"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-tg-text">
                  {t.productTitle} · قسمت {t.partNumber} · {t.assetKind === "highlight" ? "برش" : "ریلز"}: {t.assetLabel}
                </p>
                <p className="text-xs text-tg-secondary">
                  {t.channelLabel} — این {t.assetKind === "highlight" ? "برش" : "ریلز"} هنوز کاور مخصوص ندارد (برای یوتیوب لازم است)
                </p>
              </div>
              <Link href={t.href} className="inline-flex shrink-0 items-center gap-1 text-xs text-tg-accent hover:underline">
                باز کردن
                <ExternalLink className="h-3 w-3" />
              </Link>
            </li>
          ))}
          {visible.map((t) => (
            <li key={`${t.partId}:${t.activity}`} className="p-3 flex items-center gap-3">
              <input
                type="checkbox"
                checked={false}
                onChange={() => setDone((d) => ({ ...d, [`${t.partId}:${t.activity}`]: true }))}
                title="پنهان‌کردن موقت از این فهرست (تیک اصلی در اتاق محتوا زده می‌شود)"
                aria-label={`پنهان‌کردن ${t.productTitle} قسمت ${t.partNumber}`}
                className="h-4 w-4 shrink-0 rounded border-tg-border text-tg-accent focus:ring-tg-accent"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-tg-text">
                  {t.productTitle} · قسمت {t.partNumber}
                </p>
                <p className="text-xs text-tg-secondary">
                  {t.channelLabel} — قدم بعدی: <span className="font-semibold text-tg-text">{t.activityLabel}</span>
                  {t.remainingForJob > 1 && <span> ({t.remainingForJob - 1} قدم دیگر هم برای این سمت مانده)</span>}
                </p>
              </div>
              <Link href={t.href} className="inline-flex shrink-0 items-center gap-1 text-xs text-tg-accent hover:underline">
                باز کردن
                <ExternalLink className="h-3 w-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function TasksPage() {
  const [person, setPerson] = useState("");
  const { data, isLoading, error } = useSWR<TasksResponse>(
    `/api/tasks/mine${person ? `?userId=${encodeURIComponent(person)}` : ""}`,
    fetchWorkflowApi<TasksResponse>,
  );
  const { data: staff } = useSWR<{ names: NameRow[] }>("/api/users/names", fetchWorkflowApi<{ names: NameRow[] }>);

  const jobs = useMemo(() => (data?.jobs?.length ? data.jobs : (["full_editor", "reel_editor", "graphic"] as JobFunction[])), [data]);
  const showPublisher = (data?.jobs ?? []).includes("publisher_admin") || !!data?.isAdmin;

  if (isLoading) {
    return (
      <div className="space-y-6" dir="rtl">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-6" dir="rtl">
        <h1 className="text-xl font-bold text-tg-text">کارهای من</h1>
        <p className="text-sm text-rose-600">خطا در دریافت کارها: {(error as Error)?.message}</p>
      </div>
    );
  }

  const byJob = (job: JobFunction): ChecklistTask[] => data.checklist.filter((t) => t.job === job);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">کارهای من</h1>
          <p className="text-sm text-tg-secondary">
            قدم بعدی هر قسمت برای سمت‌های شما — بدون نیاز به باز کردن دونه‌دونه صفحه‌ها. تیک اصلی در اتاق محتوا زده می‌شود.
          </p>
        </div>
        {data.isAdmin && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-tg-secondary">گزارش همکار:</span>
            <Select value={person} onChange={(e) => setPerson(e.target.value)} className="min-h-[40px] text-sm" aria-label="فیلتر همکار">
              <option value="">همه</option>
              {(staff?.names ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {data.jobs.length === 0 && !data.isAdmin && (
        <Card className="p-4">
          <p className="text-sm text-tg-secondary">برای شما هنوز سمتی ثبت نشده است. از مدیر بخواهید در صفحه کاربران برایتان سمت تعیین کند.</p>
        </Card>
      )}

      <div className="grid gap-4">
        {jobs.filter((j) => j !== "publisher_admin").map((job) => (
          <JobSection key={job} job={job} tasks={byJob(job)} assetTasks={job === "graphic" ? (data.assetCovers ?? []) : undefined} />
        ))}
      </div>

      {showPublisher && (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-tg-border flex items-center justify-between">
            <h2 className="font-semibold text-tg-text flex items-center gap-2">
              <Send className="h-4 w-4 text-tg-accent" />
              صف انتشار (ادمین)
            </h2>
            <span className="text-xs text-tg-secondary">{data.publications.length} مورد</span>
          </div>
          {data.publications.length === 0 ? (
            <p className="p-4 text-sm text-tg-secondary">انتشار آماده/ناموفق/زمان‌بندی‌شده‌ای وجود ندارد.</p>
          ) : (
            <ul className="divide-y divide-tg-border">
              {data.publications.map((p) => (
                <li key={p.id} className="p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-tg-text">{p.deliverableName}</p>
                    <p className="text-xs text-tg-secondary">
                      {p.programTitle} · {p.platform} · {PUB_STATUS_FA[p.status] ?? p.status}
                      {p.scheduledAt && (
                        <span className="inline-flex items-center gap-1">
                          {" "}· <Clock3 className="h-3 w-3" /> {formatJalaliDateTime(p.scheduledAt)}
                        </span>
                      )}
                    </p>
                  </div>
                  <Link href={p.href} className="inline-flex shrink-0 items-center gap-1 text-xs text-tg-accent hover:underline">
                    باز کردن
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {data.isAdmin && (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-tg-border">
            <h2 className="font-semibold text-tg-text">گزارش امروز ({data.todayTotal} تیک)</h2>
          </div>
          {data.today.length === 0 ? (
            <p className="p-4 text-sm text-tg-secondary">امروز هنوز تیکی ثبت نشده است.</p>
          ) : (
            <ul className="divide-y divide-tg-border">
              {data.today.map((t) => (
                <li key={t.userId} className="p-3 flex items-center justify-between text-sm">
                  <span className="text-tg-text">{t.name}</span>
                  <span className="text-tg-secondary">{t.count} تیک</span>
                </li>
              ))}
            </ul>
          )}
          {person && (
            <div className="p-3 border-t border-tg-border">
              <Button size="sm" variant="secondary" onClick={() => setPerson("")}>
                حذف فیلتر همکار
              </Button>
            </div>
          )}
        </Card>
      )}

      {data.checklist.length === 0 && data.publications.length === 0 && <EmptyState title="کاری باقی نمانده است" />}
    </div>
  );
}
