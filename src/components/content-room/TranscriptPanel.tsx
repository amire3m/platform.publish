"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Textarea } from "@/components/ui";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";

interface TranscriptData {
  status: "none" | "queued" | "processing" | "ready" | "error";
  text?: string;
  srt?: string;
  captions?: { youtube: string; instagram: string } | null;
  version?: number;
  error?: string | null;
}

const STATUS_FA: Record<string, string> = {
  queued: "در صف",
  processing: "در حال پردازش",
  ready: "آماده",
  error: "خطا",
};

export function TranscriptPanel({ partId, hasFile, onToast }: { partId: string; hasFile: boolean; onToast: (msg: string) => void }) {
  const { data, error, isLoading, mutate } = useSWR<TranscriptData>(
    `/api/content-room/parts/${partId}/transcript`,
    fetchContentRoomApi,
    { refreshInterval: (d) => (d?.status === "queued" || d?.status === "processing" ? 5000 : 0) },
  );
  const [working, setWorking] = useState<"transcribe" | "captions" | "save" | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const status = data?.status ?? "none";
  const text = draft ?? data?.text ?? "";

  async function callApi<T>(fn: () => Promise<T>, key: NonNullable<typeof working>): Promise<T | null> {
    setWorking(key);
    setActionError(null);
    try {
      return await fn();
    } catch (e) {
      setActionError(e instanceof ContentRoomApiError ? e.message : e instanceof Error ? e.message : "خطا");
      return null;
    } finally {
      setWorking(null);
    }
  }

  async function handleTranscribe() {
    const r = await callApi(
      () => fetchContentRoomApi<{ status: string }>(`/api/content-room/parts/${partId}/transcribe`, { method: "POST" }),
      "transcribe",
    );
    if (r) {
      setDraft(null);
      await mutate();
    }
  }

  async function handleSave() {
    if (data?.version == null) return;
    const r = await callApi(
      () =>
        fetchContentRoomApi<{ text: string; srt: string; version: number }>(`/api/content-room/parts/${partId}/transcript`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, expectedVersion: data.version }),
        }),
      "save",
    );
    if (r) {
      setDraft(null);
      onToast("رونوشت ذخیره شد.");
      await mutate();
    }
  }

  const [tone, setTone] = useState<string>("خودکار");
  async function handleCaptions() {
    const r = await callApi(
      () =>
        fetchContentRoomApi<{ youtube: string; instagram: string }>(`/api/content-room/parts/${partId}/captions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tone: tone === "خودکار" ? undefined : tone }),
        }),
      "captions",
    );
    if (r) {
      onToast("کپشن‌ها ساخته شد.");
      await mutate();
    }
  }

  function copyText(value: string, label: string) {
    const done = () => onToast(`${label} کپی شد.`);
    try {
      const p = navigator.clipboard?.writeText(value);
      if (p && typeof p.then === "function") p.then(done).catch(() => setActionError("کپی ناموفق بود."));
      else done();
    } catch {
      setActionError("کپی ناموفق بود.");
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-tg-border p-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-tg-text">رونوشت و کپشن هوشمند</p>
          {status !== "none" && (
            <span className="rounded-full bg-tg-hover px-2 py-0.5 text-[11px] text-tg-secondary">
              {STATUS_FA[status] ?? status}
            </span>
          )}
        </div>
        {status === "none" || status === "error" ? (
          <Button size="sm" onClick={handleTranscribe} disabled={working !== null || !hasFile} title={!hasFile ? "اول ویدیو را لینک کنید" : "رونویسی"}>
            {working === "transcribe" ? "در حال شروع..." : "رونویسی"}
          </Button>
        ) : null}
      </div>

      {isLoading && <p className="mt-2 text-xs text-tg-secondary">در حال دریافت...</p>}
      {error && <p className="mt-2 text-xs text-rose-600" role="alert">دریافت رونوشت ناموفق بود.</p>}
      {actionError && <p className="mt-2 text-xs text-rose-600" role="alert">{actionError}</p>}
      {status === "error" && data?.error && <p className="mt-2 text-xs text-rose-600">{data.error}</p>}

      {(status === "ready" || status === "error") && data?.text != null && (
        <div className="mt-3 space-y-2">
          <Textarea value={text} onChange={(e) => setDraft(e.target.value)} rows={4} className="min-h-[96px] text-sm" aria-label="متن رونوشت" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleSave} disabled={working !== null || draft === null || draft === data.text}>
              {working === "save" ? "در حال ذخیره..." : "ذخیره ویرایش"}
            </Button>
            {data.srt ? (
              <a href={`/api/content-room/parts/${partId}/subtitle`} className="inline-flex items-center rounded-lg bg-tg-hover px-3 py-1.5 text-xs font-medium text-tg-text hover:brightness-95">
                دانلود SRT
              </a>
            ) : null}
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="min-h-[32px] rounded-lg border border-tg-border bg-tg-surface px-2 text-xs">
              {["خودکار","صمیمی","رسمی","طنز","انگیزشی","جنجالی","حرفه‌ای","صریح"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button size="sm" variant="secondary" onClick={handleCaptions} disabled={working !== null}>
              {working === "captions" ? "در حال ساخت..." : "ساخت کپشن"}
            </Button>
          </div>
        </div>
      )}

      {data?.captions ? (
        <div className="mt-3 grid gap-2">
          <div className="rounded-md bg-tg-hover/40 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-tg-secondary">کپشن یوتیوب</p>
              <button type="button" onClick={() => copyText(data.captions!.youtube, "کپشن یوتیوب")} className="text-[11px] text-tg-accent hover:underline">
                کپی
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-tg-text">{data.captions.youtube}</p>
          </div>
          <div className="rounded-md bg-tg-hover/40 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-tg-secondary">کپشن اینستاگرام</p>
              <button type="button" onClick={() => copyText(data.captions!.instagram, "کپشن اینستاگرام")} className="text-[11px] text-tg-accent hover:underline">
                کپی
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-tg-text">{data.captions.instagram}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
