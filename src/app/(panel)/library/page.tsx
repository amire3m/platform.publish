"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Search, Play, Film, Image as ImageIcon } from "lucide-react";
import { Card, Input, Select, Button, EmptyState, Skeleton } from "@/components/ui";
import { ChannelOptions } from "@/components/ChannelOptions";
import { DedicatedPlayer } from "@/components/media/DedicatedPlayer";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا");
  return body.data;
};

export default function LibraryPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [channel, setChannel] = useState("");
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (type) p.set("type", type);
    if (channel) p.set("channel", channel);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [q, type, channel]);

  const { data, isLoading, error } = useSWR<{ items: Array<{ id: string; filename: string; type: string; channel: string; playbackUrl: string; telegramLink?: string; createdAt: string }> }>(`/api/library${qs}`, fetcher);
  const items = data?.items ?? [];
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-tg-text">کتابخانه مستقل</h1>
        <p className="text-sm text-tg-secondary">مشاهده مستقیم همه ویدیوها — ویدیوی خام، برش‌ها و ریلزهای هر قسمت + دارایی‌های تلگرام — بر اساس دسترسی نقش/کانال شما</p>
      </div>
      <Card className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tg-secondary" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو نام محصول..." className="pr-9" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">همه نوع‌ها</option>
            <option value="video">ویدئو</option>
            <option value="highlight">برش</option>
            <option value="reel">ریلز</option>
            <option value="cover">کاور</option>
          </Select>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">همه کانال‌ها</option>
            <ChannelOptions />
          </Select>
        </div>
      </Card>

      {isLoading && <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>}
      {error && <p className="text-sm text-rose-600">{(error as Error).message}</p>}
      {!isLoading && !error && items.length === 0 && <EmptyState title="ویدیویی یافت نشد" description="فیلتر را تغییر دهید یا ویدیویی به اتاق محتوا اضافه کنید." />}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Card key={it.id} className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-tg-hover px-2 py-0.5 text-[11px]">{it.type}</span>
              <span className="text-[11px] text-tg-secondary">{it.channel}</span>
            </div>
            <p className="line-clamp-1 text-sm font-semibold" title={it.filename}>{it.filename}</p>
            <div className="overflow-hidden rounded-lg border border-tg-border bg-black">
              {it.type === "cover" ? (
                <img src={it.playbackUrl} alt={it.filename} className="max-h-48 w-full object-contain" onError={(e) => setFailedIds((s) => new Set(s).add(it.id))} />
              ) : failedIds.has(it.id) ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 bg-zinc-900 p-4 text-white">
                  <p className="text-xs">پخش مستقیم برای فایل‌های حجیم از طریق ربات محدود است.</p>
                  {it.telegramLink ? (
                    <a href={it.telegramLink} target="_blank" rel="noopener noreferrer" className="rounded bg-tg-accent px-3 py-1 text-xs text-white">
                      مشاهده در تلگرام
                    </a>
                  ) : (
                    <p className="text-[11px] opacity-70">لینک تلگرام در دسترس نیست</p>
                  )}
                </div>
              ) : (
                <DedicatedPlayer src={it.playbackUrl} title={it.filename} className="aspect-video w-full" onError={() => setFailedIds((s) => new Set(s).add(it.id))} />
              )}
            </div>
            {failedIds.has(it.id) && it.telegramLink && <a href={it.telegramLink} target="_blank" className="text-[11px] text-tg-accent hover:underline">مشاهده در تلگرام</a>}
            <p className="text-[11px] text-tg-secondary">{new Date(it.createdAt).toLocaleDateString("fa-IR")}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
