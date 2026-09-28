"use client";

import { useState } from "react";
import { Button, Input, Label, Textarea, Modal } from "@/components/ui";

interface Part {
  id: string;
  partNumber: number;
  fileRef?: string | null;
}

interface Props {
  open: boolean;
  product: { id: string; title: string; channel: string; parts?: Part[]; version: number };
  onClose: () => void;
  onSuccess: (programId: string) => void;
  onError: (msg: string) => void;
}

export function SendToPublishModal({ open, product, onClose, onSuccess, onError }: Props) {
  const parts = (product.parts ?? []).filter((p) => (p as unknown as { isActive?: boolean }).isActive ?? true).sort((a, b) => a.partNumber - b.partNumber);
  const [overrides, setOverrides] = useState<Record<string, { youtubeTitle: string; youtubeDescription: string; instagramCaption: string }>>({});
  const [schedules, setSchedules] = useState<Record<string, { youtubeScheduledAt: string; instagramScheduledAt: string }>>({});
  const [sending, setSending] = useState(false);

  function update(partId: string, field: string, value: string) {
    setOverrides((prev) => ({ ...prev, [partId]: { ...prev[partId], [field]: value } as never }));
  }
  function updateSchedule(partId: string, field: string, value: string) {
    setSchedules((prev) => ({ ...prev, [partId]: { ...prev[partId], [field]: value } as never }));
  }

  async function handleSend() {
    setSending(true);
    try {
      const partOverrides = parts.map((p) => {
        const o = overrides[p.id] ?? { youtubeTitle: "", youtubeDescription: "", instagramCaption: "" };
        return {
          partId: p.id,
          youtubeTitle: o.youtubeTitle?.trim() || undefined,
          youtubeDescription: o.youtubeDescription?.trim() || undefined,
          instagramCaption: o.instagramCaption?.trim() || undefined,
        };
      });
      const perPartSchedules = parts.map((p) => {
        const s = schedules[p.id] ?? { youtubeScheduledAt: "", instagramScheduledAt: "" };
        return {
          partId: p.id,
          youtubeScheduledAt: s.youtubeScheduledAt ? new Date(s.youtubeScheduledAt).toISOString() : null,
          instagramScheduledAt: s.instagramScheduledAt ? new Date(s.instagramScheduledAt).toISOString() : null,
        };
      }).filter((s) => s.youtubeScheduledAt || s.instagramScheduledAt);
      const payload: Record<string, unknown> = {
        expectedVersion: product.version,
        partOverrides,
      };
      if (perPartSchedules.length > 0) payload.perPartSchedules = perPartSchedules;
      const res = await fetch(`/api/content-room/products/${product.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "خطا در ارسال");
      onSuccess(json.data.programId);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : "خطا");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ارسال به اتاق انتشار — زمان مستقل هر پلتفرم">
      <div className="space-y-4" dir="rtl">
        <p className="text-xs leading-relaxed text-tg-secondary">
          ریلز یک فایل دارد ولی <b>دو انتشار جدا</b> می‌سازد: <span className="text-tg-text">یوتیوب Shorts</span> + <span className="text-tg-text">اینستاگرام</span> — زمان هر کدام را جدا انتخاب کن. خالی = آماده برای انتشار فوری. بعد هم در اتاق انتشار هر کدام را جدا زمان‌بندی/ویرایش می‌توانی کرد.
        </p>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {parts.map((p) => (
            <div key={p.id} className="rounded-xl border border-tg-border p-3">
              <p className="mb-3 text-sm font-bold text-tg-text">قسمت {p.partNumber}</p>
              <div className="grid gap-3">
                <div className="rounded-lg bg-tg-hover/30 p-2.5">
                  <Label>یوتیوب — عنوان / توضیحات + زمان یوتیوب</Label>
                  <Input
                    value={overrides[p.id]?.youtubeTitle ?? ""}
                    onChange={(e) => update(p.id, "youtubeTitle", e.target.value)}
                    placeholder={`${product.title} - قسمت ${p.partNumber}`}
                    className="mt-1.5 text-xs"
                  />
                  <Textarea
                    value={overrides[p.id]?.youtubeDescription ?? ""}
                    onChange={(e) => update(p.id, "youtubeDescription", e.target.value)}
                    rows={2}
                    placeholder="توضیحات ۲-۳ خط..."
                    className="mt-2 text-xs"
                  />
                  <div className="mt-2">
                    <Label>زمان یوتیوب (کامل/هایلایت/ریلز Shorts)</Label>
                    <Input type="datetime-local" value={schedules[p.id]?.youtubeScheduledAt ?? ""} onChange={(e) => updateSchedule(p.id, "youtubeScheduledAt", e.target.value)} className="mt-1 text-xs" />
                  </div>
                </div>
                <div className="rounded-lg bg-pink-500/5 p-2.5">
                  <Label>اینستاگرام — کپشن ریلز + زمان اینستاگرام</Label>
                  <Textarea
                    value={overrides[p.id]?.instagramCaption ?? ""}
                    onChange={(e) => update(p.id, "instagramCaption", e.target.value)}
                    rows={2}
                    placeholder="کپشن کوتاه + هشتگ..."
                    className="mt-1.5 text-xs"
                  />
                  <div className="mt-2">
                    <Label>زمان اینستاگرام (ریلز/کاور)</Label>
                    <Input type="datetime-local" value={schedules[p.id]?.instagramScheduledAt ?? ""} onChange={(e) => updateSchedule(p.id, "instagramScheduledAt", e.target.value)} className="mt-1 text-xs" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={sending}>انصراف</Button>
          <Button onClick={handleSend} disabled={sending}>{sending ? "در حال ارسال..." : "ارسال"}</Button>
        </div>
      </div>
    </Modal>
  );
}
