"use client";
import { useState } from "react";
import useSWR from "swr";
import { Radio, SkipForward, Square, Play, AlertTriangle, ListVideo } from "lucide-react";
import { Button, Card, Input, Select, EmptyState, Skeleton } from "@/components/ui";
import { useToast } from "@/components/providers";

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
}

const fetcher = async (url: string): Promise<LivePublic> => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا");
  return body.data;
};

function formatSec(total: number | null): string {
  if (total == null || !isFinite(total)) return "—";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_FA: Record<QueueItem["status"], string> = {
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

export default function LivePage() {
  const { showToast } = useToast();
  const { data, error, mutate } = useSWR<LivePublic>("/api/live/playlist", fetcher, { refreshInterval: 4000 });
  const [playlistInput, setPlaylistInput] = useState("");
  const [rtmpUrl, setRtmpUrl] = useState("rtmp://a.rtmp.youtube.com/live2");
  const [streamKey, setStreamKey] = useState("");
  const [quality, setQuality] = useState("720");
  const [loop, setLoop] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);

  const active = data?.isActive ?? false;
  const current = data && data.currentIndex >= 0 ? data.queue[data.currentIndex] : null;

  async function handleStart() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/live/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistInput, rtmpUrl, streamKey, quality, loop }),
      });
      const body = await res.json();
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

  async function handleControl(action: "skip" | "stop") {
    setControlBusy(true);
    try {
      const res = await fetch("/api/live/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "اقدام ناموفق بود");
      showToast(action === "skip" ? "ویدیوی بعدی شروع شد." : "لایو متوقف شد.", "info");
      await mutate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "خطا", "error");
    } finally {
      setControlBusy(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-tg-text">
          <Radio className="h-5 w-5 text-rose-500" />
          لایو پلی‌لیست یوتیوب
        </h1>
        <p className="text-sm text-tg-secondary">پخش زنده پلی‌لیست یوتیوب با passthrough (بدون انکود) به RTMP یوتیوب — سبک روی سرور.</p>
      </div>

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
              <label className="text-xs font-medium text-tg-secondary">لینک یا شناسه پلی‌لیست یوتیوب</label>
              <Input value={playlistInput} onChange={(e) => setPlaylistInput(e.target.value)} placeholder="https://www.youtube.com/playlist?list=PL... یا PL..." className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-tg-secondary">RTMP URL یوتیوب</label>
              <Input value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)} className="mt-1" dir="ltr" />
            </div>
            <div>
              <label className="text-xs font-medium text-tg-secondary">کلید استریم (Stream Key)</label>
              <Input value={streamKey} onChange={(e) => setStreamKey(e.target.value)} type="password" placeholder="xxxx-xxxx-xxxx-xxxx" className="mt-1" dir="ltr" />
              <p className="mt-1 text-[11px] text-tg-secondary">از YouTube Studio → Go Live → Stream settings. فقط رمزنگاری‌شده استفاده و هرگز نمایش داده نمی‌شود.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-tg-secondary">حالت استریم</label>
              <Select value={quality} onChange={(e) => setQuality(e.target.value)} className="mt-1">
                <option value="720">720p — پیشنهادی (کلیدفریم ۲ ثانیه، بدون هشدار یوتیوب)</option>
                <option value="1080">1080p بدون انکود (کیفیت کامل — ممکن است هشدار بافر بدهد)</option>
              </Select>
              <p className="mt-1 text-[11px] text-tg-secondary">حالت 720p با انکود سبک (ultrafast) کلیدفریم هر ۲ ثانیه می‌سازد و روی این سرور با حاشیه ۲× اجرا می‌شود.</p>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm text-tg-text">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="h-4 w-4" />
                تکرار پلی‌لیست پس از پایان
              </label>
            </div>
          </div>
          <Button onClick={handleStart} disabled={submitting || !playlistInput.trim() || !streamKey.trim()} className="min-h-[44px]">
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
              <span className="rounded-full bg-tg-hover px-2.5 py-1 text-[11px] text-tg-secondary">کیفیت: تا {data.quality}p</span>
              <span className="rounded-full bg-tg-hover px-2.5 py-1 text-[11px] text-tg-secondary">{data.rtmpTarget}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleControl("skip")} disabled={controlBusy} className="min-h-[36px]">
                <SkipForward className="h-3.5 w-3.5" />
                رد کردن
              </Button>
              <Button size="sm" onClick={() => handleControl("stop")} disabled={controlBusy} className="min-h-[36px]">
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
                <span>گذشته: {formatSec(data.currentElapsedSec)}</span>
                <span>کل: {formatSec(current.durationSec)}</span>
              </div>
              {current.durationSec ? (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tg-hover">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, Math.round((data.currentElapsedSec / current.durationSec) * 100))}%` }} />
                </div>
              ) : null}
            </div>
          )}
        </Card>
      )}

      {data && data.queue.length > 0 && (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-tg-text">
            <ListVideo className="h-4 w-4 text-tg-secondary" />
            صف پخش ({data.queue.length} ویدیو{data.loop ? " — تکرارشونده" : ""})
          </h2>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {data.queue.map((q, i) => (
              <div key={`${q.videoId}-${i}`} className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs ${i === data.currentIndex ? "border border-rose-500/30 bg-rose-500/5" : "bg-tg-hover/30"}`}>
                <span className={`min-w-0 flex-1 truncate ${i === data.currentIndex ? "font-semibold text-tg-text" : "text-tg-text/80"}`} title={q.title}>
                  {i + 1}. {q.title}
                </span>
                <span className="ml-2 shrink-0 text-[11px] text-tg-secondary">{formatSec(q.durationSec)}</span>
                <span className={`mr-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                  q.status === "playing" ? "bg-rose-500/15 text-rose-600"
                  : q.status === "done" ? "bg-emerald-500/15 text-emerald-700"
                  : q.status === "failed" ? "bg-amber-500/15 text-amber-700"
                  : q.status === "skipped" ? "bg-slate-500/15 text-slate-500"
                  : "bg-tg-hover text-tg-secondary"
                }`}>{STATUS_FA[q.status]}</span>
              </div>
            ))}
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
