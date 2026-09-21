"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { useToast } from "@/components/providers";
import type { PublicAccountDto } from "@/lib/accounts/public";

interface Props {
  account: PublicAccountDto;
  onSaved: () => void;
}

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function PublishScheduleForm({ account, onSaved }: Props) {
  const { showToast } = useToast();
  const [dailyCap, setDailyCap] = useState(account.publishDailyCap != null ? String(account.publishDailyCap) : "");
  const [cooldownMin, setCooldownMin] = useState(account.publishCooldownMin != null ? String(account.publishCooldownMin) : "");
  const [windowStart, setWindowStart] = useState(account.publishWindowStart ?? "");
  const [windowEnd, setWindowEnd] = useState(account.publishWindowEnd ?? "");
  const [jitterMin, setJitterMin] = useState(String(account.publishJitterMin ?? 0));
  const [instantPost, setInstantPost] = useState(!!account.instantPost);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publishDailyCap: numOrNull(dailyCap),
          publishCooldownMin: numOrNull(cooldownMin),
          publishWindowStart: windowStart || null,
          publishWindowEnd: windowEnd || null,
          publishJitterMin: numOrNull(jitterMin) ?? 0,
          instantPost,
        }),
      });
      const json = await res.json();
      if (!json.ok) return showToast(json.error ?? "خطا در ذخیره", "error");
      showToast("زمان‌بندی انتشار به‌روزرسانی شد.", "success");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-3 rounded-lg border border-tg-border bg-tg-hover/30 p-2.5">
      <summary className="cursor-pointer text-xs font-bold text-tg-text">زمان‌بندی انتشار</summary>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <Label>سقف روزانه (خالی = نامحدود)</Label>
          <Input type="number" min={0} max={50} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} placeholder="نامحدود" className="min-h-[40px] text-xs" />
        </div>
        <div>
          <Label>فاصله بین انتشار (دقیقه)</Label>
          <Input type="number" min={0} max={1440} value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} placeholder="ندارد" className="min-h-[40px] text-xs" />
        </div>
        <div>
          <Label>پنجره از ساعت</Label>
          <Input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="min-h-[40px] text-xs" />
        </div>
        <div>
          <Label>پنجره تا ساعت</Label>
          <Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="min-h-[40px] text-xs" />
        </div>
        <div>
          <Label>جیتر ورودی جدید (دقیقه)</Label>
          <Input type="number" min={0} max={120} value={jitterMin} onChange={(e) => setJitterMin(e.target.value)} className="min-h-[40px] text-xs" />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-1.5 text-xs text-tg-text">
            <input type="checkbox" checked={instantPost} onChange={(e) => setInstantPost(e.target.checked)} className="h-4 w-4" />
            انتشار فوری ورودی‌ها
          </label>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-tg-secondary">
          امروز {account.publishedTodayCount ?? 0} منتشر شده{account.publishDailyCap != null ? ` از سقف ${account.publishDailyCap}` : ""}
        </p>
        <Button size="sm" onClick={save} disabled={saving} className="min-h-[36px] text-xs">
          {saving ? "در حال ذخیره…" : "ذخیره"}
        </Button>
      </div>
    </details>
  );
}
