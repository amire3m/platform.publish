"use client";

import { useState } from "react";
import { Button, Input, Label, Textarea, Modal } from "@/components/ui";

interface Part {
  id: string;
  partNumber: number;
  fileRef?: string | null;
  highlightFileRef?: string | null;
  reelFileRef?: string | null;
  coverFileRef?: string | null;
}

interface Props {
  open: boolean;
  product: { id: string; title: string; channel: string; parts?: Part[]; version: number };
  onClose: () => void;
  onSuccess: (programId: string) => void;
  onError: (msg: string) => void;
}

type Kind = "youtube_full" | "highlight" | "reel" | "cover";
const KINDS: Array<{ kind: Kind; label: string; desc: string }> = [
  { kind: "youtube_full", label: "ویدیو کامل — یوتیوب", desc: "ویدیوی اصلی بلند" },
  { kind: "highlight", label: "برش (هایلایت) — یوتیوب", desc: "برش کوتاه از ویدیو کامل، مستقل" },
  { kind: "reel", label: "ریلز — یوتیوب Shorts + اینستاگرام", desc: "یک فایل، دو انتشار جدا با زمان مستقل" },
];

export function SendToPublishModal({ open, product, onClose, onSuccess, onError }: Props) {
  const parts = (product.parts ?? []).filter((p) => (p as unknown as { isActive?: boolean }).isActive ?? true).sort((a, b) => a.partNumber - b.partNumber);
  const [overrides, setOverrides] = useState<Record<string, { title: string; description: string; playlistId: string; caption: string }>>({});
  const [schedules, setSchedules] = useState<Record<string, { youtubeAt: string; instagramAt: string }>>({});
  const [sending, setSending] = useState(false);

  function key(partId: string, kind: Kind) { return `${partId}:${kind}`; }
  function upd(partId: string, kind: Kind, field: string, value: string) {
    const k = key(partId, kind);
    setOverrides((prev) => {
      const cur = (prev[k] ?? { title: "", description: "", playlistId: "", caption: "" }) as Record<string, string>;
      return { ...prev, [k]: { ...cur, [field]: value } as never };
    });
  }
  function updSched(partId: string, kind: Kind, field: string, value: string) {
    const k = key(partId, kind);
    setSchedules((prev) => {
      const cur = (prev[k] ?? { youtubeAt: "", instagramAt: "" }) as Record<string, string>;
      return { ...prev, [k]: { ...cur, [field]: value } as never };
    });
  }

  async function handleSend() {
    setSending(true);
    try {
      const partOverrides: Array<{ partId: string; kind: string; title?: string; description?: string; playlistId?: string | null; instagramCaption?: string }> = [];
      const perPartSchedules: Array<{ partId: string; kind?: string | null; youtubeScheduledAt?: string | null; instagramScheduledAt?: string | null }> = [];
      for (const p of parts) {
        for (const k of KINDS) {
          const o = overrides[key(p.id, k.kind as Kind)] ?? { title: "", description: "", playlistId: "", caption: "" };
          if (o.title?.trim() || o.description?.trim() || o.playlistId?.trim() || o.caption?.trim()) {
            partOverrides.push({
              partId: p.id,
              kind: k.kind,
              title: o.title?.trim() || undefined,
              description: o.description?.trim() || undefined,
              playlistId: o.playlistId?.trim() || null,
              instagramCaption: k.kind === "reel" ? (o.caption?.trim() || undefined) : undefined,
            });
          }
          const s = schedules[key(p.id, k.kind as Kind)];
          if (s?.youtubeAt || s?.instagramAt) {
            perPartSchedules.push({
              partId: p.id,
              kind: k.kind,
              youtubeScheduledAt: s?.youtubeAt ? new Date(s.youtubeAt).toISOString() : null,
              instagramScheduledAt: s?.instagramAt ? new Date(s.instagramAt).toISOString() : null,
            });
          }
        }
      }
      // Cover has no publication — just ensure file exists, no metadata needed
      const payload: Record<string, unknown> = { expectedVersion: product.version, partOverrides, perPartSchedules };
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
    <Modal open={open} onClose={onClose} title="ارسال به اتاق انتشار — هر جزء مستقل + کاور مشترک">
      <div className="space-y-4" dir="rtl">
        <p className="text-xs leading-relaxed text-tg-secondary">
          هر برنامه <b>یک کاور</b> دارد (به‌عنوان تامبنیل همهٔ ویدیوها استفاده می‌شود). سه ویدیو <b>مستقل</b> هستند: ویدیو کامل، برش و ریلز — هر کدام عنوان/توضیحات/پلی‌لیست و زمان جدا برای یوتیوب دارند. ریلز علاوه بر یوتیوب، یک کپشن و زمان جدا برای اینستاگرام هم دارد.
        </p>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          {parts.map((p) => {
            const hasCover = !!p.coverFileRef;
            return (
              <div key={p.id} className="rounded-xl border border-tg-border p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-bold text-tg-text">قسمت {p.partNumber}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${hasCover ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>{hasCover ? "کاور ✓" : "کاور: در انتظار فایل"}</span>
                </div>
                <div className="space-y-3">
                  {KINDS.map((k) => (
                    <div key={k.kind} className={`rounded-lg border p-2.5 ${k.kind === "reel" ? "bg-violet-500/5 border-violet-200" : k.kind === "highlight" ? "bg-amber-500/5 border-amber-200" : "bg-tg-hover/20"}`}>
                      <p className="text-xs font-bold text-tg-text">{k.label}</p>
                      <p className="mb-2 text-[10px] text-tg-secondary">{k.desc}</p>
                      <div className="grid gap-2">
                        <div>
                          <Label>عنوان یوتیوب</Label>
                          <Input value={overrides[key(p.id, k.kind as Kind)]?.title ?? ""} onChange={(e) => upd(p.id, k.kind as Kind, "title", e.target.value)} placeholder={`${product.title} - قسمت ${p.partNumber} - ${k.label}`} className="mt-1 text-xs" />
                        </div>
                        <div>
                          <Label>توضیحات یوتیوب</Label>
                          <Textarea value={overrides[key(p.id, k.kind as Kind)]?.description ?? ""} onChange={(e) => upd(p.id, k.kind as Kind, "description", e.target.value)} rows={2} placeholder="توضیحات ۳-۴ خط، لینک‌ها، هشتگ..." className="mt-1 text-xs" />
                        </div>
                        <div>
                          <Label>پلی‌لیست یوتیوب (ID یا خالی)</Label>
                          <Input value={overrides[key(p.id, k.kind as Kind)]?.playlistId ?? ""} onChange={(e) => upd(p.id, k.kind as Kind, "playlistId", e.target.value)} placeholder="PLxxxxxxxx یا خالی" className="mt-1 text-xs" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label>زمان یوتیوب</Label>
                            <Input type="datetime-local" value={schedules[key(p.id, k.kind as Kind)]?.youtubeAt ?? ""} onChange={(e) => updSched(p.id, k.kind as Kind, "youtubeAt", e.target.value)} className="mt-1 text-xs" />
                          </div>
                          {k.kind === "reel" && (
                            <div>
                              <Label>زمان اینستاگرام</Label>
                              <Input type="datetime-local" value={schedules[key(p.id, k.kind as Kind)]?.instagramAt ?? ""} onChange={(e) => updSched(p.id, k.kind as Kind, "instagramAt", e.target.value)} className="mt-1 text-xs" />
                            </div>
                          )}
                        </div>
                        {k.kind === "reel" && (
                          <div>
                            <Label>کپشن اینستاگرام</Label>
                            <Textarea value={overrides[key(p.id, k.kind as Kind)]?.caption ?? ""} onChange={(e) => upd(p.id, k.kind as Kind, "caption", e.target.value)} rows={2} placeholder="کپشن کوتاه + هشتگ..." className="mt-1 text-xs" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={sending}>انصراف</Button>
          <Button onClick={handleSend} disabled={sending}>{sending ? "در حال ارسال..." : "ارسال"}</Button>
        </div>
      </div>
    </Modal>
  );
}
