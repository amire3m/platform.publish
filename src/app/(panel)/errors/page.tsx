"use client";

import useSWR from "swr";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button, Card, EmptyState, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/providers";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import { platformLabelFa } from "@/lib/presentation-fa";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ContentRow {
  id: string;
  title: string;
  status: string;
  error: { message: string; at: string } | null;
  platformTargets: { platform: string; status: string; lastError?: string }[];
  updatedAt: string;
}

export default function ErrorsPage() {
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; data: ContentRow[] }>("/api/errors", fetcher);
  const { showToast } = useToast();
  const rows = data?.data ?? [];

  async function retry(id: string) {
    const res = await fetch(`/api/content/${id}/retry`, { method: "POST" });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast("درخواست تلاش مجدد ثبت شد.", "success");
    mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tg-text">خطاهای انتشار</h1>
        <p className="text-sm text-tg-secondary">محتواهایی که در انتشار با خطا مواجه شده‌اند</p>
      </div>

      {!isLoading && rows.length === 0 && <EmptyState title="هیچ خطایی ثبت نشده است 🎉" />}

      <div className="space-y-3">
        {rows.map((r) => (
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
    </div>
  );
}
