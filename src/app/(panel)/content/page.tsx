"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { FileText, Film, LayoutGrid, List, Plus } from "lucide-react";
import { InstagramIcon, YoutubeIcon } from "@/components/brand-icons";
import { Button, Card, EmptyState, Input, Select, Skeleton, StatusBadge } from "@/components/ui";
import { formatJalaliDateTime } from "@/lib/date/jalali";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ContentRow {
  id: string;
  title: string;
  status: string;
  approvalStatus: string;
  createdAt: string;
  scheduledAtUtc: string | null;
  platformTargets: { platform: string; account_id: string; content_type: string; status: string }[];
  media: unknown[];
}

const STATUS_OPTIONS = [
  ["", "همه وضعیت‌ها"],
  ["draft", "پیش‌نویس"],
  ["in_review", "در بررسی"],
  ["changes_requested", "نیازمند اصلاح"],
  ["approved", "تأییدشده"],
  ["scheduled", "زمان‌بندی‌شده"],
  ["publishing", "در حال انتشار"],
  ["published", "منتشرشده"],
  ["failed", "ناموفق"],
  ["archived", "آرشیوشده"],
];

export default function ContentLibraryPage() {
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (platform) query.set("platform", platform);
  if (q) query.set("q", q);

  const { data, isLoading } = useSWR<{ ok: boolean; data: ContentRow[] }>(`/api/content?${query.toString()}`, fetcher);
  const rows = useMemo(() => data?.data ?? [], [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">کتابخانه محتوا</h1>
          <p className="text-sm text-tg-secondary">جست‌وجو، فیلتر و مدیریت تمام محتواهای ثبت‌شده</p>
        </div>
        <Link href="/content/new">
          <Button>
            <Plus className="h-4 w-4" />
            ایجاد محتوا
          </Button>
        </Link>
      </div>

      <Card className="flex flex-wrap gap-3">
        <Input placeholder="جست‌وجو در عنوان/کپشن..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className="max-w-[180px]">
          <option value="">همه پلتفرم‌ها</option>
          <option value="youtube">یوتیوب</option>
          <option value="instagram">اینستاگرام</option>
        </Select>
        <div className="mr-auto flex gap-1">
          <Button size="sm" variant={view === "grid" ? "primary" : "secondary"} onClick={() => setView("grid")}>
            <LayoutGrid className="h-4 w-4" />
            گرید
          </Button>
          <Button size="sm" variant={view === "list" ? "primary" : "secondary"} onClick={() => setView("list")}>
            <List className="h-4 w-4" />
            لیست
          </Button>
        </div>
      </Card>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <EmptyState
          title="محتوایی یافت نشد"
          description="با فیلتر دیگری امتحان کنید یا محتوای جدیدی ایجاد کنید."
          action={
            <Link href="/content/new">
              <Button>ایجاد محتوا</Button>
            </Link>
          }
        />
      )}

      {view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((row) => (
            <Link key={row.id} href={`/content/${row.id}`}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex aspect-video items-center justify-center rounded-xl bg-tg-hover text-tg-secondary">
                  {row.media?.length ? <Film className="h-8 w-8" /> : <FileText className="h-8 w-8" />}
                </div>
                <p className="mt-3 line-clamp-1 font-semibold text-tg-text">{row.title || "(بدون عنوان)"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <StatusBadge status={row.status} />
                  {row.platformTargets?.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-tg-hover px-2 py-0.5 text-[10px] text-tg-text/75">
                      {t.platform === "youtube" ? <YoutubeIcon className="h-3 w-3" /> : <InstagramIcon className="h-3 w-3" />}
                      {t.content_type}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-tg-secondary/80">{formatJalaliDateTime(row.createdAt)}</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-tg-border text-right text-xs text-tg-secondary">
              <tr>
                <th className="p-3">عنوان</th>
                <th className="p-3">وضعیت</th>
                <th className="p-3">پلتفرم‌ها</th>
                <th className="p-3">تاریخ ایجاد</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-tg-border last:border-0 hover:bg-tg-hover">
                  <td className="p-3">
                    <Link href={`/content/${row.id}`} className="font-medium text-tg-accent hover:underline">
                      {row.title || "(بدون عنوان)"}
                    </Link>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="p-3 text-xs">{row.platformTargets?.map((t) => t.platform).join("، ")}</td>
                  <td className="p-3 text-xs text-tg-secondary">{formatJalaliDateTime(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
