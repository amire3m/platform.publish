"use client";
import { useState } from "react";
import useSWR from "swr";
import { History } from "lucide-react";
import { Card, Skeleton } from "@/components/ui";
import { liveFetcher, formatSec, StatusBadge } from "./LiveTab";

interface SessionRow {
  id: string;
  scheduleRef: string | null;
  channelRef: string | null;
  playlistInput: string;
  quality: string;
  loop: boolean;
  overlayEnabled: boolean;
  trigger: string;
  state: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  stats: { itemsPlayed: number; itemsFailed: number; secondsStreamed: number };
}

interface SessionItem {
  id: string;
  position: number;
  videoId: string;
  title: string;
  durationSec: number | null;
  status: "pending" | "playing" | "done" | "failed" | "skipped";
}

const STATE_FA_SESSION: Record<string, string> = {
  live: "زنده",
  stopping: "در حال توقف",
  stopped: "پایان یافت",
  interrupted: "قطع‌شده",
  error: "خطا",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

function fmtDurationSec(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} دقیقه`;
  return `${Math.floor(min / 60)} ساعت و ${min % 60} دقیقه`;
}

export default function HistoryTab() {
  const { data, isLoading } = useSWR<SessionRow[]>("/api/live/sessions?limit=50", liveFetcher, { refreshInterval: 30000 });
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail } = useSWR<{ session: SessionRow; items: SessionItem[] }>(
    detailId ? `/api/live/sessions?id=${detailId}` : null,
    liveFetcher,
  );

  return (
    <div className="space-y-3" dir="rtl">
      <h2 className="flex items-center gap-2 text-sm font-bold text-tg-text">
        <History className="h-4 w-4 text-tg-secondary" />
        تاریخچه نشست‌های لایو
      </h2>
      {isLoading && <Skeleton className="h-32" />}
      {(data ?? []).map((s) => (
        <Card key={s.id} className="space-y-2 py-3">
          <button className="w-full text-right" onClick={() => setDetailId(detailId === s.id ? null : s.id)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-tg-text">
                  <span className={`ml-2 inline-block h-2 w-2 rounded-full ${
                    s.state === "live" ? "animate-pulse bg-rose-500"
                    : s.state === "stopped" ? "bg-emerald-500"
                    : s.state === "interrupted" ? "bg-amber-500"
                    : "bg-slate-400"
                  }`} />
                  {fmtDate(s.startedAt)}
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] ${s.trigger === "schedule" ? "bg-tg-accent/15 text-tg-accent" : "bg-tg-hover text-tg-secondary"}`}>
                    {s.trigger === "schedule" ? "خودکار" : "دستی"}
                  </span>
                  <span className="mr-1 rounded-full bg-tg-hover px-2 py-0.5 text-[10px] text-tg-secondary">{STATE_FA_SESSION[s.state] ?? s.state}</span>
                </p>
                <p className="text-[11px] text-tg-secondary">
                  {s.finishedAt ? fmtDurationSec(new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) : "در حال اجرا"}
                  {" · "}پخش‌شده: {s.stats?.itemsPlayed ?? 0} · ناموفق: {s.stats?.itemsFailed ?? 0} · {s.quality}p
                </p>
              </div>
              <span className="text-[11px] text-tg-secondary">{detailId === s.id ? "بستن" : "جزئیات"}</span>
            </div>
            {s.error && <p className="text-[11px] text-amber-700 dark:text-amber-300">خطا: {s.error}</p>}
          </button>
          {detailId === s.id && detail && (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded bg-tg-hover/20 p-2">
              {detail.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between rounded px-2 py-1 text-xs bg-tg-hover/40">
                  <span className="min-w-0 flex-1 truncate text-tg-text/80" title={it.title}>{it.position + 1}. {it.title}</span>
                  <span className="ml-2 shrink-0 text-[11px] text-tg-secondary">{formatSec(it.durationSec)}</span>
                  <StatusBadge status={it.status} />
                </div>
              ))}
              {detail.items.length === 0 && <p className="py-2 text-center text-[11px] text-tg-secondary">آیتمی ثبت نشده.</p>}
            </div>
          )}
        </Card>
      ))}
      {data && data.length === 0 && <Card><p className="py-6 text-center text-sm text-tg-secondary">هنوز نشستی ثبت نشده است.</p></Card>}
    </div>
  );
}
