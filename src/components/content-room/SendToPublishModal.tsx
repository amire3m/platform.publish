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
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);

  function update(partId: string, field: string, value: string) {
    setOverrides((prev) => ({ ...prev, [partId]: { ...prev[partId], [field]: value } as never }));
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
      const payload: Record<string, unknown> = {
        expectedVersion: product.version,
        partOverrides,
      };
      if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString();
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
    <Modal open={open} onClose={onClose} title="ارسال به اتاق انتشار">
      <div className="space-y-4" dir="rtl">
        <p className="text-xs text-tg-secondary">برای یوتیوب عنوان و توضیحات، برای اینستاگرام (فقط ریلز) کپشن را بنویس. خالی بگذاری از عنوان محصول استفاده می‌شود.</p>
        <div>
          <Label>زمان انتشار (خالی = آماده برای انتشار فوری)</Label>
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1" />
        </div>
        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {parts.map((p) => (
            <div key={p.id} className="rounded-xl border border-tg-border p-3">
              <p className="mb-2 text-sm font-bold text-tg-text">قسمت {p.partNumber}</p>
              <div className="grid gap-3">
                <div>
                  <Label>عنوان یوتیوب</Label>
                  <Input
                    value={overrides[p.id]?.youtubeTitle ?? ""}
                    onChange={(e) => update(p.id, "youtubeTitle", e.target.value)}
                    placeholder={`${product.title} - قسمت ${p.partNumber}`}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label>توضیحات یوتیوب</Label>
                  <Textarea
                    value={overrides[p.id]?.youtubeDescription ?? ""}
                    onChange={(e) => update(p.id, "youtubeDescription", e.target.value)}
                    rows={2}
                    placeholder="توضیحات ۲-۳ خط..."
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label>کپشن اینستاگرام (ریلز)</Label>
                  <Textarea
                    value={overrides[p.id]?.instagramCaption ?? ""}
                    onChange={(e) => update(p.id, "instagramCaption", e.target.value)}
                    rows={2}
                    placeholder="کپشن کوتاه + هشتگ..."
                    className="mt-1 text-xs"
                  />
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
