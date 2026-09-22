"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Card, Input, Label, Skeleton } from "@/components/ui";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function GrowthPage() {
  const { data: expData, mutate: mutateExp } = useSWR<{ ok: boolean; data: { experiments: Array<{ id: string; contentId: string; status: string }> } }>("/api/growth?scope=experiments", fetcher);
  const { data: outcome, mutate: mutateOutcome } = useSWR<{ ok: boolean; data: { settings: { primaryKpi: string; targetValue: number | null; targetWindowDays: number; monthlyBudget: number | null; currency: string }; metrics: { views: number; subs: number; watchHours: number; revenue: number | null }; progress: number; hasRevenue: boolean } }>("/api/growth?scope=outcome", fetcher);
  const [contentId, setContentId] = useState("");
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");

  async function createExp() {
    const res = await fetch("/api/growth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-experiment", contentId, variants: [{ title: v1 }, { title: v2 }].filter((v) => v.title) }) });
    const j = await res.json(); if (!j.ok) alert(j.error ?? "خطا"); else { setV1(""); setV2(""); await mutateExp(); }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-xl font-bold text-tg-text">آزمایش‌های رشد</h1>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-bold text-tg-text">آزمایش عنوان/کاور</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <div><Label>شناسه محتوا</Label><Input value={contentId} onChange={(e) => setContentId(e.target.value)} placeholder="CNT-..." className="min-h-[40px] text-xs" /></div>
          <div><Label>عنوان واریانت ۱</Label><Input value={v1} onChange={(e) => setV1(e.target.value)} className="min-h-[40px] text-xs" /></div>
          <div><Label>عنوان واریانت ۲</Label><Input value={v2} onChange={(e) => setV2(e.target.value)} className="min-h-[40px] text-xs" /></div>
        </div>
        <Button size="sm" onClick={createExp} className="mt-2 min-h-[36px] text-xs">ساخت آزمایش</Button>
        <div className="mt-3 space-y-1">
          {(expData?.data?.experiments ?? []).slice(0, 10).map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-tg-border p-2 text-xs">
              <span>{e.id.slice(0, 12)} — محتوا {e.contentId.slice(0, 10)} — {e.status}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-bold text-tg-text">نتیجه و ROI</h2>
        {!outcome ? <Skeleton className="h-20" /> : (
          <>
            <p className="text-sm text-tg-text">KPI: {outcome.data.settings.primaryKpi} — هدف {outcome.data.settings.targetValue ?? "—"} در {outcome.data.settings.targetWindowDays} روز</p>
            <p className="text-sm text-tg-secondary">بازدید: {outcome.data.metrics.views} · مشترک: {outcome.data.metrics.subs} · ساعت تماشا: {outcome.data.metrics.watchHours} · درآمد: {outcome.data.hasRevenue ? `${outcome.data.metrics.revenue} ${outcome.data.settings.currency}` : "در دسترس نیست"}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-tg-hover"><div className="h-full bg-tg-accent" style={{ width: `${outcome.data.progress}%` }} /></div>
          </>
        )}
      </Card>
    </div>
  );
}
