"use client";

import useSWR from "swr";
import { DatabaseBackup, Download } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { useToast } from "@/components/providers";
import { formatJalaliDateTime } from "@/lib/date/jalali";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Overview {
  totals: { channels: number; pages: number; followers: number; views: number; engagement: number };
  statusCounts: Record<string, number>;
  syncStatus: string;
}

export default function ReportsPage() {
  const { data } = useSWR<{ ok: boolean; data: Overview }>("/api/analytics/overview", fetcher);
  const { showToast } = useToast();
  const overview = data?.data;

  async function rebuildIndex() {
    const res = await fetch("/api/telegram/rebuild-index", { method: "POST" });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast(`بازسازی ایندکس انجام شد. اتصال تلگرام: ${json.data.connected ? "برقرار" : "برقرار نیست"}`, "info");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">گزارش‌ها</h1>
          <p className="text-sm text-tg-secondary">خلاصه وضعیت سیستم و ابزارهای نگهداری داده</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/telegram/export">
            <Button variant="secondary">
              <Download className="h-4 w-4" />
              Export کامل داده (JSON)
            </Button>
          </a>
          <Button onClick={rebuildIndex}>
            <DatabaseBackup className="h-4 w-4" />
            بازسازی ایندکس
          </Button>
        </div>
      </div>

      {overview ? (
        <Card>
          <h2 className="mb-3 font-semibold">وضعیت محتوا بر اساس مرحله چرخه انتشار</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(overview.statusCounts).map(([status, count]) => (
              <div key={status} className="rounded-xl border border-tg-border p-3 text-center">
                <p className="text-2xl font-bold">{count.toLocaleString("fa-IR")}</p>
                <p className="text-xs text-tg-secondary">{status}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState title="در حال بارگذاری گزارش..." />
      )}

      <Card>
        <h2 className="mb-2 font-semibold">یادداشت معماری</h2>
        <p className="text-sm text-tg-text/75">
          مخزن اصلی این پلتفرم گروه خصوصی تلگرام است. جدول‌های این پایگاه‌داده محلی صرفاً یک ایندکس قابل بازسازی هستند. در صورت خرابی یا
          ری‌استارت سرور، از دکمه «بازسازی ایندکس» یا Import کردن فایل Export قبلی برای بازیابی استفاده کنید.
        </p>
        <p className="mt-2 text-xs text-tg-secondary/80">آخرین بررسی همگام‌سازی: {overview?.syncStatus} — {formatJalaliDateTime(new Date())}</p>
      </Card>
    </div>
  );
}
