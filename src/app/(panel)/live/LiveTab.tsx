"use client";
import { useState } from "react";
import useSWR from "swr";
import { Radio, SkipForward, Square, Play, AlertTriangle, ListVideo, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { Button, Card, Input, Select, EmptyState, Skeleton } from "@/components/ui";
import { useToast } from "@/components/providers";
import { parseJsonResponse } from "@/lib/client/http";

interface QueueItem {
  videoId: string;
  title: string;
  durationSec: number | null;
  status: "pending" | "playing" | "done" | "failed" | "skipped";
}

interface LivePublic {
  state: "idle" | "starting" | "live" | "stopping" | "stopped" | "error";
  quality?: string;
  loop?: boolean;
  playlistInput?: string;
  rtmpTarget?: string | null;
  queue: QueueItem[];
  currentIndex: number;
  currentElapsedSec: number;
  startedAt?: number | null;
  finishedAt?: number | null;
  error?: string | null;
  isActive?: boolean;
  sourceType?: "playlist" | "m3u8";
  sceneName?: string | null;
  elapsedTotalSec?: number;
  plannedTotalSec?: number;
  remainingSec?: number | null;
  positionPct?: number | null;
  nextItem?: { title: string; startAtSec: number } | null;
}

interface ChannelPublic {
  id: string;
  name: string;
  provider: string;
  rtmpUrl: string;
  isActive: boolean;
}

interface SceneRow {
  name: string;
  items: { kind: string }[];
}

export const liveFetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  const body = await parseJsonResponse<{ ok: boolean; data: T; error?: string }>(res);
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا");
  return body.data as T;
};

export function formatSec(total: number | null): string {
  if (total == null || !isFinite(total)) return "—";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export const STATUS_FA: Record<QueueItem["status"], string> = {
  pending: "در صف",
  playing: "در حال پخش",
  done: "پخش شد",
  failed: "ناموفق",
  skipped: "رد شد",
};

const STATE_FA: Record<LivePublic["state"], string> = {
  idle: "غیرفعال",
  starting: "در حال آماده‌سازی",
  live: "زنده",
  stopping: "در حال توقف",
  stopped: "متوقف شد",
  error: "خطا",
};

export function StatusBadge({ status }: { status: QueueItem["status"] }) {
  return (
    <span className={`mr-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
      status === "playing" ? "bg-rose-500/15 text-rose-600"
      : status === "done" ? "bg-emerald-500/15 text-emerald-700"
      : status === "failed" ? "bg-amber-500/15 text-amber-700"
      : status === "skipped" ? "bg-slate-500/15 text-slate-500"
      : "bg-tg-hover text-tg-secondary"
    }`}>{STATUS_FA[status]}</span>
  );
}

export default function LiveTab() {
  const { showToast } = useToast();
  const { data, error, mutate } = useSWR<LivePublic>("/api/live/playlist", liveFetcher, { refreshInterval: 4000 });
  const { data: channels } = useSWR<ChannelPublic[]>("/api/live/channels", liveFetcher, { refreshInterval: 60000 });
  const { data: settings } = useSWR<{ scenes?: SceneRow[] }>("/api/live/settings", liveFetcher, { refreshInterval: 60000 });
  const [playlistInput, setPlaylistInput] = useState("");
  const [channelRef, setChannelRef] = useState("");
  const [rtmpUrl, setRtmpUrl] = useState("rtmp://a.rtmp.youtube.com/live2");
  const [streamKey, setStreamKey] = useState("");
  const [quality, setQuality] = useState("720");
  const [loop, setLoop] = useState(true);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = data?.isActive ?? false;
  const current = data && data.currentIndex >= 0 ? data.queue[data.currentIndex] : null;
  const useChannel = !!channelRef;

  async function handleStart() {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { playlistInput, quality, loop, overlayEnabled };
      if (useChannel) payload.channelRef = channelRef;
      else { payload.rtmpUrl = rtmpUrl; payload.streamKey = streamKey; }
      const res = await fetch("/api/live/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await parseJsonResponse<{ ok: boolean; error?: string }>(res);
      if (!res.ok || !body.ok) throw new Error(body.error ?? "شروع لایو ناموفق بود");
      showToast("لایو شروع شد — وضعیت را همین‌جا دنبال کنید.", "success");
      setStreamKey("");
      await mutate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "خطا در شروع لایو", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function control(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/live/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resp = await parseJsonResponse<{ ok: boolean; error?: string }>(res);
      if (!res.ok || !resp.ok) throw new Error(resp.error ?? "اقدام ناموفق بود");
      showToast(okMsg, "info");
      await mutate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "خطا", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4" /> {(error as Error).message}
        </div>
      )}

      {!active && (
        <Card className="space-y-4">
          <h2 className="text-sm font-bold text-tg-text">شروع جلسه جدید</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-tg-secondary">منبع پخش — پلی‌لیست یوتیوب یا m3u8</label>
              <Input value={playlistInput} onChange={(e) => setPlaylistInput(e.target.value)} placeholder="https://www.youtube.com/playlist?list=PL... یا https://tv.example.com/live.m3u8" className="mt-1" dir="ltr" />
              <p className="mt-1 text-[11px] text-tg-secondary">لینک m3u8 به‌صورت passthrough پخش می‌شود (تقریباً بدون مصرف CPU) و خودکار reconnect می‌شود.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-tg-secondary">کانال مقصد</label>
              <Select value={channelRef} onChange={(e) => setChannelRef(e.target.value)} className="mt-1">
                <option value="">— کلید دستی —</option>
                {(channels ?? []).filter((c) => c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            {!useChannel && (
              <>
                <div>
                  <label className="text-xs font-medium text-tg-secondary">RTMP URL</label>
                  <Input value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)} className="mt-1" dir="ltr" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-tg-secondary">کلید استریم (Stream Key)</label>
                  <Input value={streamKey} onChange={(e) => setStreamKey(e.target.value)} type="password" placeholder="xxxx-xxxx-xxxx-xxxx" className="mt-1" dir="ltr" />
                  <p className="mt-1 text-[11px] text-tg-secondary">از YouTube Studio → Go Live → Stream settings. برای ذخیره‌سازی از تب «کانال‌ها» استفاده کنید.</p>
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-tg-secondary">حالت استریم</label>
              <Select value={quality} onChange={(e) => setQuality(e.target.value)} className="mt-1">
                <option value="720">720p — پیشنهادی (کلیدفریم ۲ ثانیه)</option>
                <option value="1080">1080p بدون انکود (ممکن است هشدار بافر بدهد)</option>
              </Select>
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-tg-text">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="h-4 w-4" />
                تکرار پلی‌لیست
              </label>
              <label className="flex items-center gap-2 text-sm text-tg-text" title="نیازمند لوگوی پیکربندی‌شده و حالت 720p">
                <input type="checkbox" checked={overlayEnabled} onChange={(e) => setOverlayEnabled(e.target.checked)} className="h-4 w-4" />
                لوگو (فقط 720p)
              </label>
            </div>
          </div>
          <Button onClick={handleStart} disabled={submitting || !playlistInput.trim() || (!useChannel && !streamKey.trim())} className="min-h-[44px]">
            <Play className="h-4 w-4" />
            {submitting ? "در حال آماده‌سازی..." : "شروع لایو"}
          </Button>
        </Card>
      )}

      {active && data && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${data.state === "live" ? "bg-rose-500/15 text-rose-600" : "bg-tg-hover text-tg-secondary"}`}>
                {data.state === "live" && <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />}
                {STATE_FA[data.state]}
              </span>
              <span className="rounded-full bg-tg-hover px-2.5 py-1 text-[11px] text-tg-secondary">کیفیت: {data.quality}p</span>
              <span className="rounded-full bg-tg-hover px-2.5 py-1 text-[11px] text-tg-secondary">{data.rtmpTarget}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => control({ action: "skip" }, "ویدیوی بعدی شروع شد.")} disabled={busy} className="min-h-[36px]">
                <SkipForward className="h-3.5 w-3.5" />
                رد کردن
              </Button>
              <Button size="sm" onClick={() => control({ action: "stop" }, "لایو متوقف شد.")} disabled={busy} className="min-h-[36px]">
                <Square className="h-3.5 w-3.5" />
                توقف لایو
              </Button>
            </div>
          </div>

          {current && (
            <div className="rounded-lg border border-tg-border bg-tg-hover/20 p-3">
              <p className="text-xs text-tg-secondary">در حال پخش ({data.currentIndex + 1} از {data.queue.length})</p>
              <p className="mt-1 truncate text-sm font-semibold text-tg-text" title={current.title}>{current.title}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-tg-secondary">
                <span>دقیقه {formatSec(data.currentElapsedSec)} از {formatSec(current.durationSec)}</span>
                <span>کل: {formatSec(current.durationSec)}</span>
              </div>
              {current.durationSec ? (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tg-hover">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, Math.round((data.currentElapsedSec / current.durationSec) * 100))}%` }} />
                </div>
              ) : null}
            </div>
          )}

          {data.sourceType === "playlist" && (data.plannedTotalSec ?? 0) > 0 && (
            <div className="rounded-lg border border-tg-border bg-tg-hover/20 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-tg-text">موقعیت در برنامه</span>
                <span className="text-tg-secondary">{data.positionPct ?? 0}٪</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-tg-secondary">
                <span>دقیقه {formatSec(data.elapsedTotalSec ?? 0)} از کل {formatSec(data.plannedTotalSec ?? 0)}</span>
                <span>مانده: {formatSec(data.remainingSec ?? null)}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-tg-hover">
                <div className="h-full rounded-full bg-tg-accent" style={{ width: `${data.positionPct ?? 0}%` }} />
              </div>
              {data.nextItem && (
                <p className="mt-2 text-[11px] text-tg-secondary">
                  بعدی: <span className="text-tg-text" title={data.nextItem.title}>{data.nextItem.title.slice(0, 40)}</span>
                  {data.loop ? " (سپس از ابتدا تکرار می‌شود)" : ""}
                </p>
              )}
            </div>
          )}

          {(settings?.scenes ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-tg-border bg-tg-hover/20 p-3">
              <span className="text-xs font-semibold text-tg-text">صحنه فعلی:</span>
              <span className="rounded-full bg-tg-accent/15 px-2.5 py-1 text-[11px] text-tg-accent">{data.sceneName ?? "بدون گرافیک"}</span>
              <select
                value=""
                onChange={(e) => { if (e.target.value) control({ action: "scene", sceneName: e.target.value }, "صحنه تغییر کرد."); }}
                className="rounded-lg border border-tg-border bg-tg-bg px-2 py-1.5 text-xs text-tg-text"
              >
                <option value="">سوییچ به…</option>
                {(settings?.scenes ?? []).map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
              <span className="text-[11px] text-tg-secondary">
                {data.sourceType === "m3u8" ? "سوییچ فوری" : "اعمال از ویدیوی بعدی"}
              </span>
            </div>
          )}
        </Card>
      )}

      {active && data && (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-tg-text">
            <Radio className="h-4 w-4 text-rose-500" />
            افزودن ویدیو به صف حین پخش
          </h2>
          <div className="flex gap-2">
            <Input value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." dir="ltr" />
            <Button
              onClick={async () => {
                if (!addInput.trim()) return;
                await control({ action: "add", input: addInput.trim() }, "ویدیو به صف اضافه شد.");
                setAddInput("");
              }}
              disabled={busy || !addInput.trim()}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" /> افزودن
            </Button>
          </div>
        </Card>
      )}

      {data && data.queue.length > 0 && (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-tg-text">
            <ListVideo className="h-4 w-4 text-tg-secondary" />
            صف پخش ({data.queue.length} ویدیو{data.loop ? " — تکرارشونده" : ""})
          </h2>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {data.queue.map((q, i) => {
              const isCurrent = i === data.currentIndex;
              const canEdit = active && q.status === "pending";
              const canReplay = active && (q.status === "done" || q.status === "failed" || q.status === "skipped");
              return (
                <div key={`${q.videoId}-${i}`} className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs ${isCurrent ? "border border-rose-500/30 bg-rose-500/5" : "bg-tg-hover/30"}`}>
                  <span className={`min-w-0 flex-1 truncate ${isCurrent ? "font-semibold text-tg-text" : "text-tg-text/80"}`} title={q.title}>
                    {i + 1}. {q.title}
                  </span>
                  <span className="ml-2 shrink-0 text-[11px] text-tg-secondary">{formatSec(q.durationSec)}</span>
                  <StatusBadge status={q.status} />
                  {canEdit && (
                    <span className="mr-1 flex shrink-0 items-center gap-0.5">
                      <button onClick={() => control({ action: "move", videoId: q.videoId, direction: -1 }, "جابه‌جا شد.")} disabled={busy} title="بالا" className="rounded p-1 text-tg-secondary hover:bg-tg-hover hover:text-tg-text"><ArrowUp className="h-3 w-3" /></button>
                      <button onClick={() => control({ action: "move", videoId: q.videoId, direction: 1 }, "جابه‌جا شد.")} disabled={busy} title="پایین" className="rounded p-1 text-tg-secondary hover:bg-tg-hover hover:text-tg-text"><ArrowDown className="h-3 w-3" /></button>
                      <button onClick={() => control({ action: "remove", videoId: q.videoId }, "از صف حذف شد.")} disabled={busy} title="حذف" className="rounded p-1 text-rose-500 hover:bg-rose-500/10"><Trash2 className="h-3 w-3" /></button>
                    </span>
                  )}
                  {canReplay && (
                    <button onClick={() => control({ action: "replay", videoId: q.videoId }, "برای پخش مجدد در صف قرار گرفت.")} disabled={busy} title="پخش مجدد" className="mr-1 shrink-0 rounded p-1 text-tg-secondary hover:bg-tg-hover hover:text-tg-text"><RotateCcw className="h-3 w-3" /></button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!data && !error && <Skeleton className="h-40" />}
      {data && data.state === "idle" && !active && (
        <EmptyState title="جلسه لایویی وجود ندارد" description="فرم بالا را پر کنید و شروع کنید." />
      )}
    </div>
  );
}
