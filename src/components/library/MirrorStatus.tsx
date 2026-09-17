"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronLeft, CloudUpload, RefreshCw } from "lucide-react";
import { Button, Card, Select } from "@/components/ui";
import { MIRROR_STATUS_FA, type MirrorCounts } from "@/lib/mirrors/status";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا");
  return body.data;
};

interface MirrorItem {
  id: string;
  partId: string | null;
  fileId: string;
  provider: string;
  remoteId: string | null;
  remoteUrl: string | null;
  status: keyof MirrorCounts;
  error: string | null;
  productTitle: string | null;
  updatedAt: string | null;
}

interface MirrorResponse {
  items: MirrorItem[];
  counts: MirrorCounts;
}

const STATUS_CLS: Record<keyof MirrorCounts, string> = {
  ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  uploading: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  queued: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  error: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

export function MirrorStatusBox() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const qs = filter ? `?status=${filter}` : "";
  const { data, isLoading, error, mutate } = useSWR<MirrorResponse>(`/api/mirrors${qs}`, fetcher);
  const counts = data?.counts;

  async function retry(body: { fileId?: string; all?: boolean }) {
    const key = body.all ? "all" : (body.fileId ?? "");
    setBusy(key);
    try {
      const res = await fetch("/api/mirrors/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("retry failed");
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-right" aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <ChevronLeft className="h-4 w-4 shrink-0 text-tg-secondary" />}
        <CloudUpload className="h-4 w-4 shrink-0 text-tg-accent" />
        <span className="text-sm font-bold text-tg-text">وضعیت آینه‌ها (vids.st)</span>
        {counts && (
          <span className="mr-auto flex flex-wrap gap-1">
            {(Object.keys(counts) as Array<keyof MirrorCounts>).map((s) => (
              <span key={s} className={`rounded-full px-2 py-0.5 text-[10px] ${STATUS_CLS[s]}`}>
                {MIRROR_STATUS_FA[s]}: {counts[s]}
              </span>
            ))}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 border-t border-tg-border pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 max-w-[180px] text-xs" aria-label="فیلتر وضعیت">
              <option value="">همه وضعیت‌ها</option>
              <option value="error">خطا</option>
              <option value="queued">در صف</option>
              <option value="uploading">در حال آپلود</option>
              <option value="ready">آماده</option>
            </Select>
            {(counts?.error ?? 0) > 0 && (
              <Button variant="secondary" size="sm" disabled={busy === "all"} onClick={() => retry({ all: true })} className="min-h-[36px]">
                <RefreshCw className="h-3.5 w-3.5" />
                {busy === "all" ? "…" : `تلاش مجدد همه خطاها (${counts?.error})`}
              </Button>
            )}
          </div>
          {isLoading && <p className="py-2 text-center text-xs text-tg-secondary">در حال بارگذاری…</p>}
          {error && <p className="py-2 text-center text-xs text-rose-600">{(error as Error).message}</p>}
          {!isLoading && !error && (data?.items ?? []).length === 0 && (
            <p className="py-2 text-center text-[11px] text-tg-secondary">موردی نیست.</p>
          )}
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {(data?.items ?? []).map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-tg-border/60 px-2.5 py-1.5 text-xs">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${STATUS_CLS[m.status]}`}>
                  {MIRROR_STATUS_FA[m.status] ?? m.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-tg-text" title={m.productTitle ?? m.fileId}>
                  {m.productTitle ?? m.fileId}
                </span>
                {m.remoteUrl && (
                  <a href={m.remoteUrl} target="_blank" rel="noreferrer" className="shrink-0 text-tg-accent hover:underline">
                    پخش
                  </a>
                )}
                {m.status === "error" && (
                  <button
                    type="button"
                    disabled={busy === m.fileId}
                    onClick={() => retry({ fileId: m.fileId })}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-tg-hover px-2 py-1 text-[11px] text-tg-text hover:brightness-95 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {busy === m.fileId ? "…" : "تلاش مجدد"}
                  </button>
                )}
                {m.error && <span className="w-full truncate text-[10px] text-rose-600" title={m.error}>{m.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
