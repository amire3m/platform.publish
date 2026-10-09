"use client";

import { useState } from "react";
import useSWR from "swr";
import { Music, Plus, X } from "lucide-react";
import { Button, Input, Label, Modal } from "@/components/ui";
import { fetchContentRoomApi } from "@/lib/content-room/client";

interface MusicItem {
  id: string;
  title: string;
  playbackUrl: string | null;
  usedInParts?: number;
}

/** Musics used in one part: link existing (no re-upload) or register new. */
export function PartMusic({ partId, partNumber, onChanged }: { partId: string; partNumber: number; onChanged?: () => void }) {
  const { data, mutate } = useSWR<{ items: MusicItem[] }>(
    `/api/content-room/parts/${partId}/music`,
    fetchContentRoomApi<{ items: MusicItem[] }>,
  );
  const { data: library, mutate: mutateLib } = useSWR<{ items: MusicItem[] }>("/api/music", fetchContentRoomApi<{ items: MusicItem[] }>);
  const [pickOpen, setPickOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = data?.items ?? [];
  const linkedIds = new Set(linked.map((m) => m.id));
  const available = (library?.items ?? []).filter((m) => !linkedIds.has(m.id));

  async function linkMusic(musicId: string) {
    setBusy(true);
    setError(null);
    try {
      await fetchContentRoomApi(`/api/content-room/parts/${partId}/music`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ musicId }),
      });
      mutate();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlinkMusic(musicId: string) {
    setBusy(true);
    try {
      await fetchContentRoomApi(`/api/content-room/parts/${partId}/music`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ musicId }),
      });
      mutate();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!title.trim() || !link.trim()) {
      setError("عنوان و لینک تلگرام الزامی است.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await fetchContentRoomApi<{ id: string }>("/api/music", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), telegramLink: link.trim() }),
      });
      await linkMusic(created.id);
      setTitle("");
      setLink("");
      setFormOpen(false);
      mutateLib();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-tg-border p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-tg-text">
          <Music className="h-3.5 w-3.5 text-tg-secondary" />
          موسیقی قسمت {partNumber} ({linked.length})
        </p>
        <Button size="sm" variant="secondary" onClick={() => setPickOpen(true)} className="min-h-[30px] text-[11px]">
          <Plus className="h-3 w-3" />
          افزودن
        </Button>
      </div>
      {linked.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {linked.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded bg-tg-hover/40 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-tg-text">{m.title}</p>
                {m.playbackUrl && <audio controls preload="none" src={m.playbackUrl} className="mt-1 w-full" />}
              </div>
              <button
                type="button"
                onClick={() => unlinkMusic(m.id)}
                disabled={busy}
                title="حذف از این قسمت (از کتابخانه پاک نمی‌شود)"
                aria-label={`حذف ${m.title} از قسمت`}
                className="shrink-0 rounded p-1 text-tg-secondary hover:bg-tg-hover hover:text-rose-500 disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}

      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title={`افزودن موسیقی به قسمت ${partNumber}`}>
        <div className="space-y-3">
          <Button className="w-full" variant="secondary" onClick={() => { setPickOpen(false); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" />
            ثبت موسیقی جدید در کتابخانه
          </Button>
          <p className="text-xs font-semibold text-tg-text">یا انتخاب از کتابخانه (بدون آپلود مجدد):</p>
          {available.length === 0 && <p className="text-xs text-tg-secondary">مورد جدیدی در کتابخانه نیست.</p>}
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {available.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded border border-tg-border p-2">
                <span className="min-w-0 flex-1 truncate text-xs text-tg-text">{m.title}</span>
                <Button size="sm" onClick={() => { linkMusic(m.id); }} disabled={busy}>
                  انتخاب
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="ثبت موسیقی جدید">
        <div className="space-y-3">
          <div>
            <Label>عنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: پس‌زمینه حماسی ۱" />
          </div>
          <div>
            <Label>لینک پیام تلگرام (حاوی فایل صوتی)</Label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://t.me/c/..." dir="ltr" />
          </div>
          <Button className="w-full" onClick={register} disabled={busy}>
            {busy ? "در حال ثبت…" : "ثبت و اتصال به این قسمت"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
