"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Card, Input, Label, Skeleton, Textarea } from "@/components/ui";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function OperatorPage() {
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; data: { strategy: { id: string; objective: string; audience: string; pillars: string[]; cadencePerWeek: number; videosPerRun: number; defaultFormat: string; primaryKpi: string; status: string } | null } }>("/api/operator", fetcher);
  const { data: runsData } = useSWR<{ ok: boolean; data: { runs: Array<{ id: string; status: string; plan: Array<{ title: string; pillar: string }>; createdAt: string }> } }>("/api/operator?scope=runs", fetcher);
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [pillars, setPillars] = useState("آموزش, مستند, برنامه تلویزیونی");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/operator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save-strategy", objective, audience, pillars: pillars.split(",").map((s) => s.trim()).filter(Boolean) }) });
      const j = await res.json(); if (!j.ok) alert(j.error ?? "خطا"); else await mutate();
    } finally { setBusy(false); }
  }
  async function activate() {
    const res = await fetch("/api/operator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "activate" }) });
    const j = await res.json(); if (!j.ok) alert(j.error ?? "خطا"); else await mutate();
  }
  async function runNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/operator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run-now" }) });
      const j = await res.json();
      if (!j.ok) alert(j.error ?? "خطا");
      else {
        const ai = j.data.aiUsed ? " (با هوش مصنوعی ✨)" : " (قالب ساده — کلید AI تنظیم نیست)";
        alert(`برنامه ساخته شد: ${j.data.plan.length} مورد${ai}\n${j.data.plan.map((p: {title:string})=> "• "+p.title).join("\n")}`);
      }
    } finally { setBusy(false); }
  }

  const s = data?.data?.strategy;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-tg-text">اپراتور خودکار کانال — نسخه ما</h1>
        <p className="text-sm text-tg-secondary">هدف و مخاطب را بده، محورها و ریتم هفتگی را تنظیم کن — اپراتور با هوش مصنوعی برنامه کامل (عنوان سئو، قلاب، توضیحات، تگ/هشتگ) می‌سازد و پیش‌نویس محتوا می‌سازد (منتظر تأیید تو). بدون کلید AI، قالب ساده می‌سازد.</p>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <Card className="p-4 space-y-3">
          <div><Label>هدف کانال</Label><Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder={s?.objective ?? "مثلاً: مالکیت آموزش تدوین برای تیم‌های کوچک"} className="min-h-[40px] text-xs" /></div>
          <div><Label>مخاطب</Label><Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={s?.audience ?? "مدیران تولید محتوا"} className="min-h-[40px] text-xs" /></div>
          <div><Label>محورها (با کاما)</Label><Input value={pillars} onChange={(e) => setPillars(e.target.value)} className="min-h-[40px] text-xs" /></div>
          {s && <p className="text-xs text-tg-secondary">وضعیت فعلی: {s.status} — {s.pillars.join("، ")} — {s.cadencePerWeek} بار در هفته</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy} className="min-h-[36px] text-xs">ذخیره استراتژی</Button>
            <Button size="sm" variant="secondary" onClick={activate} disabled={busy} className="min-h-[36px] text-xs">فعال‌سازی</Button>
            <Button size="sm" variant="secondary" onClick={runNow} disabled={busy} className="min-h-[36px] text-xs">{busy ? "…" : "اجرای فوری"}</Button>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-bold text-tg-text">اجراهای اخیر</h2>
        {(runsData?.data?.runs?.length ?? 0) === 0 ? <p className="text-xs text-tg-secondary">هنوز اجرایی نبوده.</p> : (
          <div className="space-y-2">
            {runsData!.data.runs.slice(0, 10).map((r) => (
              <div key={r.id} className="rounded-lg border border-tg-border p-2 text-xs">
                <p className="font-semibold">{r.id.slice(0, 12)} — {r.status} — {new Date(r.createdAt).toLocaleDateString("fa-IR")}</p>
                {r.plan.map((p, i) => <p key={i}>• {p.title} ({p.pillar})</p>)}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
