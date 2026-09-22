"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/components/providers";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function PaletteEditor({ accountId }: { accountId: string }) {
  const { data, mutate } = useSWR(`/api/covers?accountId=${accountId}`, fetcher);
  const { showToast } = useToast();
  const p = data?.data ?? {};
  const [paper, setPaper] = useState("#FFF8F0");
  const [primary, setPrimary] = useState("#E63946");
  const [accent, setAccent] = useState("#457B9D");

  async function save() {
    const res = await fetch("/api/covers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, paper, primary, accent, previewTitle: "نمونه کاور فارسی" }) });
    const j = await res.json(); if (!j.ok) return showToast(j.error ?? "خطا", "error");
    showToast(`پالت ذخیره شد — پیش‌نمایش ${j.data.previewSize} بایت`, "success"); await mutate();
  }

  return (
    <details className="mt-2 rounded-lg border border-tg-border p-2.5">
      <summary className="cursor-pointer text-xs font-bold">پالت اختصاصی کانال</summary>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div><Label>پس‌زمینه</Label><Input type="color" value={paper} onChange={(e) => setPaper(e.target.value)} className="h-10 p-1" /></div>
        <div><Label>اصلی</Label><Input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 p-1" /></div>
        <div><Label>تأکید</Label><Input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 p-1" /></div>
      </div>
      <Button size="sm" onClick={save} className="mt-2 min-h-[36px] text-xs">ذخیره + پیش‌نمایش 1280×720</Button>
      {p.paper && <p className="mt-1 text-[11px] text-tg-secondary">فعلی: {p.paper} / {p.primary} / {p.accent}</p>}
    </details>
  );
}
