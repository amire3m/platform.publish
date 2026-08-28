"use client";

import { useState } from "react";
import useSWR from "swr";
import { DatabaseBackup, Download, RotateCcw, Check } from "lucide-react";
import Link from "next/link";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/providers";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import { auditActionLabelFa, entityTypeLabelFa, platformLabelFa } from "@/lib/presentation-fa";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Overview {
  totals: { channels: number; pages: number; followers: number; views: number; engagement: number };
  statusCounts: Record<string, number>;
  syncStatus: string;
}
interface ContentRow {
  id: string;
  title: string;
  status: string;
  error: { message: string; at: string } | null;
  platformTargets: { platform: string; status: string; lastError?: string }[];
  updatedAt: string;
}
interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorTelegramId: string | null;
  createdAt: string;
  telegramMessageId: number | null;
}

export default function ReportsPage() {
  const [tab, setTab] = useState<"overview" | "errors" | "logs">("overview");
  const { data: overviewData } = useSWR<{ ok: boolean; data: Overview }>("/api/analytics/overview", fetcher);
  const { data: errorsData, mutate: mutateErrors, isLoading: errorsLoading } = useSWR<{ ok: boolean; data: ContentRow[] }>("/api/errors", fetcher);
  const { data: auditData, isLoading: auditLoading } = useSWR<{ ok: boolean; data: AuditEvent[] }>("/api/audit-logs", fetcher);
  const { showToast } = useToast();
  const overview = overviewData?.data;
  const errors = errorsData?.data ?? [];
  const logs = auditData?.data ?? [];

  async function rebuildIndex() {
    const res = await fetch("/api/telegram/rebuild-index", { method: "POST" });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast(`بازسازی ایندکس انجام شد. اتصال تلگرام: ${json.data.connected ? "برقرار" : "برقرار نیست"}`, "info");
  }
  async function retry(id: string) {
    const res = await fetch(`/api/content/${id}/retry`, { method: "POST" });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast("درخواست تلاش مجدد ثبت شد.", "success");
    mutateErrors();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">گزارش‌ها</h1>
          <p className="text-sm text-tg-secondary">گزارش کلی، خطاهای انتشار و لاگ فعالیت‌ها — یکجا</p>
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

      <div className="flex gap-2 border-b border-tg-border">
        {[
          { key: "overview", label: "گزارش کلی" },
          { key: "errors", label: `خطاها${errors.length ? ` (${errors.length.toLocaleString("fa-IR")})` : ""}` },
          { key: "logs", label: `لاگ فعالیت‌ها${logs.length ? ` (${logs.length.toLocaleString("fa-IR")})` : ""}` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as never)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? "border-tg-accent text-tg-accent" : "border-transparent text-tg-secondary hover:text-tg-text"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
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
              مخزن اصلی این پلتفرم گروه خصوصی تلگرام است. جدول‌های این پایگاه‌داده محلی صرفاً یک ایندکس قابل بازسازی هستند. در صورت خرابی یا ری‌استارت سرور، از دکمه «بازسازی ایندکس» یا Import کردن فایل Export قبلی برای بازیابی استفاده کنید.
            </p>
            <p className="mt-2 text-xs text-tg-secondary/80">آخرین بررسی همگام‌سازی: {overview?.syncStatus} — {formatJalaliDateTime(new Date())}</p>
          </Card>
        </div>
      )}

      {tab === "errors" && (
        <div className="space-y-3">
          {errorsLoading && <Skeleton className="h-32" />}
          {!errorsLoading && errors.length === 0 && <EmptyState title="هیچ خطایی ثبت نشده است 🎉" />}
          {errors.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={`/content/${r.id}`} className="font-semibold text-tg-accent hover:underline">
                    {r.title || r.id}
                  </Link>
                  <p className="mt-1 text-xs text-tg-secondary">{formatJalaliDateTime(r.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <Button size="sm" onClick={() => retry(r.id)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    تلاش مجدد
                  </Button>
                </div>
              </div>
              {r.error?.message && <p className="mt-2 text-sm text-rose-600">{r.error.message}</p>}
              <div className="mt-2 space-y-1">
                {r.platformTargets?.filter((t) => t.lastError).map((t, i) => (
                  <p key={i} className="text-xs text-rose-500">
                    {platformLabelFa(t.platform)}: {t.lastError}
                  </p>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-3">
          {auditLoading && <Skeleton className="h-64" />}
          {!auditLoading && logs.length === 0 && <EmptyState title="هیچ رویدادی ثبت نشده است" />}
          {logs.length > 0 && (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-tg-border text-right text-xs text-tg-secondary">
                  <tr>
                    <th className="p-3">اقدام</th>
                    <th className="p-3">نوع موجودیت</th>
                    <th className="p-3">شناسه</th>
                    <th className="p-3">انجام‌دهنده (تلگرام)</th>
                    <th className="p-3">زمان</th>
                    <th className="p-3">ثبت در تلگرام</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((r) => (
                    <tr key={r.id} className="border-b border-tg-border last:border-0">
                      <td className="p-3 text-xs">{auditActionLabelFa(r.action)}</td>
                      <td className="p-3 text-xs">{entityTypeLabelFa(r.entityType)}</td>
                      <td className="p-3 text-xs text-tg-secondary">{r.entityId ?? "—"}</td>
                      <td className="p-3 text-xs text-tg-secondary">{r.actorTelegramId ?? "سیستم"}</td>
                      <td className="p-3 text-xs text-tg-secondary">{formatJalaliDateTime(r.createdAt)}</td>
                      <td className="p-3 text-xs">{r.telegramMessageId ? <Check className="h-4 w-4 text-emerald-500" /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
