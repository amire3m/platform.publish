"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Card, Input, Skeleton } from "@/components/ui";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function EngagementPage() {
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; data: { comments: Array<{ commentId: string; author: string; text: string; sentiment: string; theme: string | null }>; spam: Array<{ commentId: string; text: string }>; drafts: Array<{ id: string; commentId: string; draftText: string }>; ideas: Array<{ id: string; title: string; evidence: string[] }> } }>("/api/engagement", fetcher);
  const [busy, setBusy] = useState(false);
  const [videoId, setVideoId] = useState("");

  async function sync() {
    setBusy(true);
    try {
      await fetch("/api/engagement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync-comments", videoId: videoId || undefined }) });
      await mutate();
    } finally { setBusy(false); }
  }
  async function draft() {
    setBusy(true);
    try {
      await fetch("/api/engagement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft-replies" }) });
      await mutate();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-xl font-bold text-tg-text">تعامل مخاطب</h1>
      <div className="flex gap-2">
        <Input value={videoId} onChange={(e) => setVideoId(e.target.value)} placeholder="videoId (خالی = ۵ ویدیوی اخیر)" className="min-h-[40px] text-xs" />
        <Button onClick={sync} disabled={busy} className="min-h-[40px] text-xs">{busy ? "…" : "همگام‌سازی کامنت‌ها"}</Button>
        <Button variant="secondary" onClick={draft} disabled={busy} className="min-h-[40px] text-xs">ساخت پیش‌نویس پاسخ</Button>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <>
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-bold text-tg-text">کامنت‌ها ({data?.data?.comments?.length ?? 0})</h2>
            <div className="space-y-1">
              {(data?.data?.comments ?? []).slice(0, 20).map((c) => (
                <div key={c.commentId} className="rounded-lg border border-tg-border p-2 text-xs">
                  <span className="font-semibold">{c.author}</span> — {c.text.slice(0, 120)} <span className="text-tg-secondary">[{c.sentiment} {c.theme ?? ""}]</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-bold text-tg-text">قرنطینه اسپم ({data?.data?.spam?.length ?? 0})</h2>
            <p className="text-xs text-tg-secondary">حذف خودکار نمی‌شود — فقط جدا نگه داشته می‌شود.</p>
            {(data?.data?.spam ?? []).slice(0, 5).map((c) => <p key={c.commentId} className="text-xs text-rose-600">{c.text.slice(0, 80)}</p>)}
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-bold text-tg-text">پیش‌نویس پاسخ‌ها ({data?.data?.drafts?.length ?? 0}) — نیاز به تأیید</h2>
            {(data?.data?.drafts ?? []).slice(0, 10).map((d) => <p key={d.id} className="rounded bg-tg-hover p-2 text-xs">{d.draftText}</p>)}
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-bold text-tg-text">ایده‌های درخواستی مخاطب</h2>
            {(data?.data?.ideas ?? []).map((i) => <p key={i.id} className="text-xs">💡 {i.title} — {i.evidence.length} کامنت</p>)}
            {(data?.data?.ideas?.length ?? 0) === 0 && <p className="text-xs text-tg-secondary">هنوز ایده‌ای با ۳+ درخواست مشابه یافت نشده.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
