"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Card, Skeleton } from "@/components/ui";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function RadarPage() {
  const { data: health, isLoading: hLoading } = useSWR<{ ok: boolean; data: { cards: Array<{ label: string; value: string; delta: string | null; tone: string }>; alerts: Array<{ level: string; message: string }> } }>("/api/radar?scope=health", fetcher);
  const { data: latest, isLoading: rLoading, mutate } = useSWR<{ ok: boolean; data: { run: { id: string; weekStart: string } | null; items: Array<{ id: string; source: string; queryLang: string; query: string; similarToTitle: string | null; title: string; channel: string | null; similarityScore: number; permalink: string | null; thumbUrl: string | null }> } }>("/api/radar?scope=latest", fetcher);
  const [running, setRunning] = useState(false);

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch("/api/radar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run" }) });
      const j = await res.json();
      if (!j.ok) alert(j.error ?? "خطا");
      await mutate();
    } finally { setRunning(false); }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-tg-text">رادار محتوا</h1>
          <p className="text-sm text-tg-secondary">سلامت الگوریتم پیج + محتوای مشابه (هفتگی، فارسی+انگلیسی)</p>
        </div>
        <Button onClick={runNow} disabled={running} className="min-h-[40px]">{running ? "در حال اجرا…" : "اجرای هفتگی"}</Button>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-bold text-tg-text">سلامت الگوریتم پیج خودت (۷/۲۸ روزه)</h2>
        {hLoading ? <Skeleton className="h-20" /> : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {(health?.data?.cards ?? []).map((c) => (
                <div key={c.label} className={`rounded-lg border p-3 ${c.tone === "fail" ? "border-rose-200 bg-rose-50 dark:bg-rose-950/20" : c.tone === "warn" ? "border-amber-200 bg-amber-50 dark:bg-amber-950/20" : "border-tg-border bg-tg-hover/30"}`}>
                  <p className="text-xs text-tg-secondary">{c.label}</p>
                  <p className="text-lg font-bold text-tg-text">{c.value} <span className="text-xs font-normal text-tg-secondary">{c.delta ?? ""}</span></p>
                </div>
              ))}
            </div>
            {(health?.data?.alerts?.length ?? 0) > 0 && (
              <div className="mt-3 space-y-1">
                {health!.data.alerts.map((a, i) => (
                  <p key={i} className={`rounded-lg px-3 py-2 text-xs ${a.level === "fail" ? "bg-rose-500/10 text-rose-700" : "bg-amber-500/10 text-amber-700"}`}>{a.message}</p>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 text-sm font-bold text-tg-text">محتوای مشابه تولیدات اخیر</h2>
        <p className="mb-2 text-xs text-tg-secondary">۵ تولید اخیر → یوتیوب + اینستا (اکسپلور) — امتیاز شباهت TF-IDF</p>
        {rLoading ? <Skeleton className="h-40" /> : (
          !latest?.data?.run ? <p className="text-sm text-tg-secondary">هنوز راداری اجرا نشده — «اجرای هفتگی» را بزن.</p> : (
            <>
              <p className="mb-2 text-xs text-tg-secondary">آخرین اجرا: {latest.data.run.weekStart} — {latest.data.items.length} مورد</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-tg-border text-xs text-tg-secondary">
                    <tr><th className="px-2 py-2 text-right">مشابه به</th><th className="px-2 py-2 text-right">پلTF</th><th className="px-2 py-2 text-right">زبان</th><th className="px-2 py-2 text-right">عنوان خارجی</th><th className="px-2 py-2 text-right">شباهت</th><th className="px-2 py-2 text-right">لینک</th></tr>
                  </thead>
                  <tbody>
                    {latest.data.items.slice(0, 50).map((it) => (
                      <tr key={it.id} className="border-b border-tg-border">
                        <td className="px-2 py-2 text-tg-text">{it.similarToTitle ?? "—"}</td>
                        <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${it.source === "youtube" ? "bg-red-500/10 text-red-600" : "bg-fuchsia-500/10 text-fuchsia-600"}`}>{it.source}</span></td>
                        <td className="px-2 py-2 text-tg-secondary">{it.queryLang}</td>
                        <td className="px-2 py-2 text-tg-text">{it.title.slice(0, 80)}</td>
                        <td className="px-2 py-2 font-mono text-xs">{(it.similarityScore * 100).toFixed(0)}%</td>
                        <td className="px-2 py-2">{it.permalink ? <a href={it.permalink} target="_blank" rel="noreferrer" className="text-tg-accent hover:underline">↗</a> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </Card>
    </div>
  );
}
