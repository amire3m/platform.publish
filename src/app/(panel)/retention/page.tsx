"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";

export default function RetentionPage() {
  const [videoId, setVideoId] = useState("");
  const [scenes, setScenes] = useState<Array<{ sceneIndex: number; startSec: number; durationSec: number; avgRetention: number; signal: string }>>([]);
  const [busy, setBusy] = useState(false);

  async function snapshot() {
    if (!videoId.trim()) return alert("videoId را وارد کنید");
    setBusy(true);
    try {
      await fetch("/api/engagement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "snapshot-retention", videoId: videoId.trim() }) });
      const res = await fetch(`/api/engagement?scope=retention&videoId=${encodeURIComponent(videoId.trim())}`);
      const j = await res.json();
      setScenes(j.data?.scenes ?? j.data ?? []);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-xl font-bold text-tg-text">نگهداشت صحنه‌ای</h1>
      <p className="text-sm text-tg-secondary">منحنی ۱۰۰ نقطه‌ای نگهداشت را به صحنه‌ها نگاشت می‌دهد — افت، بازبینی، نگه‌داشت قوی</p>
      <div className="flex gap-2">
        <Input value={videoId} onChange={(e) => setVideoId(e.target.value)} placeholder="YouTube videoId" className="min-h-[40px] text-xs" />
        <Button onClick={snapshot} disabled={busy} className="min-h-[40px] text-xs">{busy ? "…" : "دریافت منحنی"}</Button>
      </div>
      <div className="grid gap-2">
        {scenes.map((s) => (
          <Card key={s.sceneIndex} className={`p-3 border ${s.signal === "drop-off" ? "border-rose-200 bg-rose-50" : s.signal === "strong-hold" ? "border-emerald-200 bg-emerald-50" : s.signal === "rewatch" ? "border-sky-200 bg-sky-50" : "border-tg-border"}`}>
            <p className="text-sm font-semibold">صحنه {s.sceneIndex + 1} — {s.startSec}s · {s.durationSec}s — {s.avgRetention}% — {s.signal}</p>
          </Card>
        ))}
        {scenes.length === 0 && <p className="text-xs text-tg-secondary">هنوز داده‌ای نیست — یک videoId وارد و منحنی را بگیرید.</p>}
      </div>
    </div>
  );
}
