"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Card, Skeleton } from "@/components/ui";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function ReadinessPage() {
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; data: { status: string; summary: string; generatedAt: string | null; checks: Array<{ id: string; label: string; status: string; detail: string; remediation?: string }> } }>("/api/readiness", fetcher);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/readiness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ includePaidMedia: false }) });
      const j = await res.json();
      if (!j.ok) alert(j.error ?? "خطا");
      await mutate();
    } finally { setRunning(false); }
  }

  const status = data?.data?.status ?? "unknown";
  const tone = status === "pass" ? "border-emerald-200 bg-emerald-50" : status === "fail" ? "border-rose-200 bg-rose-50" : "border-tg-border bg-tg-hover/30";

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-tg-text">آمادگی تولید</h1>
          <p className="text-sm text-tg-secondary">بررسی زندهٔ اتصال‌ها قبل از فعال‌سازی تولید خودکار — بدون ساخت ویدیو</p>
        </div>
        <Button onClick={run} disabled={running} className="min-h-[40px]">{running ? "در حال بررسی…" : "اجرای بررسی"}</Button>
      </div>

      <Card className={`p-4 border ${tone}`}>
        <p className="text-sm font-bold text-tg-text">وضعیت: {status === "pass" ? "آماده ✓" : status === "fail" ? "مسدود ✗" : "نامشخص"}</p>
        <p className="mt-1 text-sm text-tg-secondary">{data?.data?.summary ?? "—"}</p>
        {data?.data?.generatedAt && <p className="mt-1 text-xs text-tg-secondary">آخرین بررسی: {new Date(data.data.generatedAt).toLocaleString("fa-IR")}</p>}
      </Card>

      {isLoading ? <Skeleton className="h-40" /> : (
        <div className="grid gap-2">
          {(data?.data?.checks ?? []).map((c) => (
            <div key={c.id} className={`rounded-lg border p-3 ${c.status === "fail" ? "border-rose-200 bg-rose-50 dark:bg-rose-950/20" : c.status === "warn" ? "border-amber-200 bg-amber-50 dark:bg-amber-950/20" : "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20"}`}>
              <p className="text-sm font-semibold text-tg-text">{c.label} <span className="text-xs font-normal">— {c.status === "ok" ? "سالم" : c.status === "warn" ? "هشدار" : "خطا"}</span></p>
              <p className="text-xs text-tg-secondary">{c.detail}</p>
              {c.remediation && <p className="mt-1 text-xs font-medium text-tg-accent">راه‌حل: {c.remediation}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
