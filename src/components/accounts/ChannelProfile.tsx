"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronLeft, RefreshCw } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import type { ChannelFull, PlaylistFull, UploadItem, VideoFull } from "@/lib/youtube/gateway";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا در خواندن از یوتیوب");
  return body.data as T;
}

function QuotaMeter({ used, cap }: { used: number; cap: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(cap, 1)) * 100));
  return (
    <p className="text-[10px] text-tg-secondary" title={`کوتای مصرفی امروز: ${used} از ${cap}`}>
      کوتا امروز: {used}/{cap} ({pct}٪)
    </p>
  );
}

function VideoRow({ accountId, item }: { accountId: string; item: UploadItem }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useSWR<{ result: VideoFull; quota: { usedToday: number; dailyCap: number } }>(
    open ? `/api/accounts/${accountId}/youtube?resource=video&id=${encodeURIComponent(item.videoId)}` : null,
    fetcher,
  );
  const v = data?.result;
  return (
    <div className="rounded-lg border border-tg-border p-2">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-right">
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-tg-secondary" /> : <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-tg-secondary" />}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-tg-text" title={item.title}>{item.title || item.videoId}</span>
        {v?.rejectionReason && (
          <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
            {v.rejectionReason === "claim" ? "بلاک صاحب اثر" : v.rejectionReason === "copyright" ? "کپی‌رایت" : v.rejectionReason}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-1 border-t border-tg-border pt-2 text-[11px] text-tg-secondary">
          {isLoading && <Skeleton className="h-8" />}
          {v && (
            <>
              <p>وضعیت: <b className="text-tg-text">{v.uploadStatus ?? "—"}</b> · حریم: <b className="text-tg-text">{v.privacyStatus ?? "—"}</b> · لایسنس: <b className="text-tg-text">{v.license ?? "—"}</b></p>
              <p>مدت: {v.duration ?? "—"} · کیفیت: {v.definition ?? "—"} · بازدید: {v.statistics.viewCount ?? "—"}</p>
              <a href={`https://youtu.be/${item.videoId}`} target="_blank" rel="noreferrer" className="font-medium text-tg-accent hover:underline">مشاهده در یوتیوب</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ChannelProfile({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"uploads" | "playlists">("uploads");
  const { data: channelData, isLoading: channelLoading, error: channelError, mutate } = useSWR<{ result: ChannelFull; quota: { usedToday: number; dailyCap: number } }>(
    open ? `/api/accounts/${accountId}/youtube?resource=channel` : null,
    fetcher,
  );
  const { data: uploadsData, isLoading: uploadsLoading } = useSWR<{ result: { items: UploadItem[]; nextPageToken: string | null }; quota: { usedToday: number; dailyCap: number } }>(
    open && tab === "uploads" ? `/api/accounts/${accountId}/youtube?resource=uploads` : null,
    fetcher,
  );
  const { data: playlistsData, isLoading: playlistsLoading } = useSWR<{ result: PlaylistFull[]; quota: { usedToday: number; dailyCap: number } }>(
    open && tab === "playlists" ? `/api/accounts/${accountId}/youtube?resource=playlists` : null,
    fetcher,
  );

  const channel = channelData?.result;
  const quota = channelData?.quota ?? uploadsData?.quota ?? playlistsData?.quota;

  return (
    <div className="mt-3 rounded-lg border border-tg-border bg-tg-hover/20 p-2.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-right" aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <ChevronLeft className="h-4 w-4 shrink-0 text-tg-secondary" />}
        <span className="text-xs font-bold text-tg-text">شناسنامه یوتیوب</span>
        <span className="mr-auto text-[10px] text-tg-secondary">خواندن زنده از API (کم‌هزینه)</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-tg-border pt-2">
          {channelLoading && <Skeleton className="h-16" />}
          {channelError && <p className="text-[11px] text-rose-600">{(channelError as Error).message}</p>}
          {channel && (
            <div className="space-y-1 text-[11px] text-tg-secondary">
              <p className="text-xs font-bold text-tg-text">{channel.title}</p>
              {channel.description && <p className="line-clamp-2 leading-relaxed">{channel.description}</p>}
              <p>مشترک: <b className="text-tg-text">{channel.statistics.subscriberCount ?? "—"}</b> · بازدید کل: <b className="text-tg-text">{channel.statistics.viewCount ?? "—"}</b> · ویدیوها: <b className="text-tg-text">{channel.statistics.videoCount ?? "—"}</b></p>
              {channel.topicCategories.length > 0 && <p className="truncate">موضوعات: {channel.topicCategories.length} دسته</p>}
              <div className="flex items-center justify-between">
                {quota && <QuotaMeter used={quota.usedToday} cap={quota.dailyCap} />}
                <Button size="sm" variant="secondary" onClick={() => mutate()} className="min-h-[30px] text-[11px]">
                  <RefreshCw className="h-3 w-3" />
                  تازه‌سازی
                </Button>
              </div>
            </div>
          )}
          <div className="flex gap-1.5">
            {(["uploads", "playlists"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${tab === t ? "bg-tg-accent text-tg-accent-fg" : "bg-tg-hover text-tg-secondary"}`}
              >
                {t === "uploads" ? "آپلودها" : "پلی‌لیست‌ها"}
              </button>
            ))}
          </div>
          {tab === "uploads" && (
            <div className="space-y-1.5">
              {uploadsLoading && <Skeleton className="h-10" />}
              {(uploadsData?.result.items ?? []).map((it) => (
                <VideoRow key={it.videoId} accountId={accountId} item={it} />
              ))}
              {(uploadsData?.result.items ?? []).length === 0 && !uploadsLoading && (
                <p className="text-[11px] text-tg-secondary">ویدیویی یافت نشد.</p>
              )}
            </div>
          )}
          {tab === "playlists" && (
            <div className="space-y-1.5">
              {playlistsLoading && <Skeleton className="h-10" />}
              {(playlistsData?.result ?? []).map((p) => (
                <div key={p.id} className="rounded-lg border border-tg-border p-2 text-[11px]">
                  <p className="font-medium text-tg-text">{p.title}</p>
                  <p className="text-tg-secondary">{p.itemCount ?? "—"} ویدیو · <span dir="ltr">{p.id}</span></p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
