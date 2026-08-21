"use client";

import useSWR from "swr";
import { Check } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { formatJalaliDateTime } from "@/lib/date/jalali";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorTelegramId: string | null;
  createdAt: string;
  telegramMessageId: number | null;
}

export default function AuditLogsPage() {
  const { data, isLoading } = useSWR<{ ok: boolean; data: AuditEvent[] }>("/api/audit-logs", fetcher);
  const rows = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tg-text">لاگ فعالیت‌ها</h1>
        <p className="text-sm text-tg-secondary">Audit Log تمام عملیات حساس، هم‌زمان در پایگاه محلی و گروه تلگرام ثبت می‌شود</p>
      </div>

      {isLoading && <Skeleton className="h-64" />}
      {!isLoading && rows.length === 0 && <EmptyState title="هیچ رویدادی ثبت نشده است" />}

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
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-tg-border last:border-0">
                <td className="p-3 font-mono text-xs">{r.action}</td>
                <td className="p-3 text-xs">{r.entityType}</td>
                <td className="p-3 text-xs text-tg-secondary">{r.entityId ?? "—"}</td>
                <td className="p-3 text-xs text-tg-secondary">{r.actorTelegramId ?? "سیستم"}</td>
                <td className="p-3 text-xs text-tg-secondary">{formatJalaliDateTime(r.createdAt)}</td>
                <td className="p-3 text-xs">{r.telegramMessageId ? <Check className="h-4 w-4 text-emerald-500" /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
