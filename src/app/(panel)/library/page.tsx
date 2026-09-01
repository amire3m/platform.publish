"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Search, Film, Image as ImageIcon, Scissors, Smartphone, ChevronDown, ChevronLeft,
  FolderOpen, Folder, Package, Tv, Users, Play,
} from "lucide-react";
import { Card, Input, Select, EmptyState, Skeleton } from "@/components/ui";
import { ChannelOptions } from "@/components/ChannelOptions";
import { DedicatedPlayer } from "@/components/media/DedicatedPlayer";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا");
  return body.data;
};

interface FileItem {
  id: string;
  filename: string;
  type: "full_video" | "highlight" | "reel" | "cover" | string;
  playbackUrl: string;
  createdAt: string;
  telegramLink?: string;
}

interface PartNode {
  partId: string;
  partNumber: number;
  fullVideo: FileItem | null;
  highlights: FileItem[];
  reels: FileItem[];
  cover: FileItem | null;
}

interface ProductNode {
  productId: string;
  title: string;
  status: string;
  parts: PartNode[];
}

interface ChannelNode {
  channel: string;
  label: string;
  products: ProductNode[];
}

interface TreeResponse {
  channels: ChannelNode[];
  group: Array<FileItem & { messageId: string }>;
}

const TYPE_META: Record<string, { label: string; icon: typeof Film; cls: string }> = {
  full_video: { label: "ویدیو کامل", icon: Film, cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  highlight: { label: "برش", icon: Scissors, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  reel: { label: "ریلز", icon: Smartphone, cls: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  cover: { label: "کاور", icon: ImageIcon, cls: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
};

function FilePreview({ item }: { item: FileItem }) {
  const [failed, setFailed] = useState(false);
  if (item.type === "cover") {
    return (
      <div className="overflow-hidden rounded-lg border border-tg-border bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.playbackUrl} alt={item.filename} className="max-h-56 w-full object-contain" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-tg-border bg-black">
      {failed ? (
        <div className="flex h-44 flex-col items-center justify-center gap-2 p-4 text-white">
          <p className="text-xs">پخش مستقیم برای این فایل ممکن نشد.</p>
          {item.telegramLink && (
            <a href={item.telegramLink} target="_blank" rel="noopener noreferrer" className="rounded bg-tg-accent px-3 py-1 text-xs">مشاهده در تلگرام</a>
          )}
        </div>
      ) : (
        <DedicatedPlayer src={item.playbackUrl} title={item.filename} className="aspect-video w-full" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function FileRow({ item }: { item: FileItem }) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[item.type] ?? TYPE_META.full_video;
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-tg-border bg-tg-surface/60">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-right">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.cls}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-tg-text" title={item.filename}>{item.filename}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${meta.cls}`}>{meta.label}</span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <Play className="h-3.5 w-3.5 shrink-0 text-tg-secondary" />}
      </button>
      {open && (
        <div className="border-t border-tg-border p-2">
          <FilePreview item={item} />
          <p className="mt-1 text-[10px] text-tg-secondary">{new Date(item.createdAt).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" })}</p>
        </div>
      )}
    </div>
  );
}

function PartSection({ part }: { part: PartNode }) {
  const [open, setOpen] = useState(false);
  const count = (part.fullVideo ? 1 : 0) + part.highlights.length + part.reels.length + (part.cover ? 1 : 0);
  return (
    <div className="rounded-lg border border-tg-border bg-tg-hover/20">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-right">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <ChevronLeft className="h-4 w-4 shrink-0 text-tg-secondary" />}
        <span className="text-xs font-bold text-tg-text">قسمت {part.partNumber}</span>
        <span className="mr-auto rounded-full bg-tg-hover px-2 py-0.5 text-[10px] text-tg-secondary">{count} فایل</span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-tg-border p-2">
          {part.fullVideo && <FileRow item={part.fullVideo} />}
          {part.highlights.map((h) => <FileRow key={h.id} item={h} />)}
          {part.reels.map((r) => <FileRow key={r.id} item={r} />)}
          {part.cover && <FileRow item={part.cover} />}
          {count === 0 && <p className="px-2 py-1 text-[11px] text-tg-secondary">فایلی ثبت نشده است.</p>}
        </div>
      )}
    </div>
  );
}

function ProductSection({ product }: { product: ProductNode }) {
  const [open, setOpen] = useState(false);
  const fileCount = product.parts.reduce((a, p) => a + (p.fullVideo ? 1 : 0) + p.highlights.length + p.reels.length + (p.cover ? 1 : 0), 0);
  return (
    <div className="rounded-lg border border-tg-border bg-tg-hover/30">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2.5 text-right">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <ChevronLeft className="h-4 w-4 shrink-0 text-tg-secondary" />}
        <Package className="h-4 w-4 shrink-0 text-tg-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tg-text" title={product.title}>{product.title}</span>
        <span className="shrink-0 rounded-full bg-tg-hover px-2 py-0.5 text-[10px] text-tg-secondary">
          {product.parts.length} قسمت · {fileCount} فایل
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-tg-border p-2">
          {product.parts.map((p) => <PartSection key={p.partId} part={p} />)}
          {product.parts.length === 0 && <p className="px-2 py-1 text-[11px] text-tg-secondary">قسمتی ثبت نشده است.</p>}
        </div>
      )}
    </div>
  );
}

function ChannelSection({ channel, defaultOpen }: { channel: ChannelNode; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [q, setQ] = useState("");
  const products = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return channel.products;
    return channel.products.filter((p) => p.title.toLowerCase().includes(needle));
  }, [channel.products, q]);
  const fileCount = channel.products.reduce(
    (a, p) => a + p.parts.reduce((b, part) => b + (part.fullVideo ? 1 : 0) + part.highlights.length + part.reels.length + (part.cover ? 1 : 0), 0),
    0,
  );
  return (
    <Card className="space-y-2 p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-right">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <ChevronLeft className="h-4 w-4 shrink-0 text-tg-secondary" />}
        {open ? <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" /> : <Folder className="h-4 w-4 shrink-0 text-amber-500" />}
        <span className="text-sm font-bold text-tg-text">{channel.label}</span>
        <span className="mr-auto rounded-full bg-tg-hover px-2 py-0.5 text-[10px] text-tg-secondary">
          {channel.products.length} محصول · {fileCount} فایل
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-tg-border pt-2">
          {channel.products.length > 5 && (
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در محصولات این کانال…" className="h-8 text-xs" />
          )}
          {products.map((p) => <ProductSection key={p.productId} product={p} />)}
          {products.length === 0 && <p className="py-2 text-center text-[11px] text-tg-secondary">محصولی یافت نشد.</p>}
        </div>
      )}
    </Card>
  );
}

export default function LibraryPage() {
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const qs = useMemo(() => {
    const s = new URLSearchParams();
    if (q.trim()) s.set("q", q.trim());
    if (channel) s.set("channel", channel);
    const str = s.toString();
    return str ? `?${str}` : "";
  }, [q, channel]);

  const { data, isLoading, error } = useSWR<TreeResponse>(`/api/library${qs}`, fetcher);
  const [groupOpen, setGroupOpen] = useState(false);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-tg-text">کتابخانه</h1>
        <p className="text-sm text-tg-secondary">ساختار درختی: کانال ← محصول ← قسمت ← ویدیو کامل، برش‌ها و ریلزها</p>
      </div>

      <Card className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tg-secondary" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو نام محصول..." className="pr-9" />
          </div>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">همه کانال‌ها</option>
            <ChannelOptions />
          </Select>
        </div>
      </Card>

      {isLoading && <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
      {error && <p className="text-sm text-rose-600">{(error as Error).message}</p>}
      {!isLoading && !error && (data?.channels ?? []).length === 0 && (data?.group ?? []).length === 0 && (
        <EmptyState title="کتابخانه خالی است" description="ابتدا ویدیوها را در اتاق محتوا به قسمت‌ها لینک یا آپلود کنید." />
      )}

      {(data?.channels ?? [])
        .filter((c) => !channel || c.channel === channel)
        .map((c) => <ChannelSection key={c.channel} channel={c} defaultOpen={(data?.channels ?? []).length <= 3} />)}

      {(data?.group ?? []).length > 0 && (
        <Card className="space-y-2 p-3">
          <button onClick={() => setGroupOpen((v) => !v)} className="flex w-full items-center gap-2 text-right">
            {groupOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <ChevronLeft className="h-4 w-4 shrink-0 text-tg-secondary" />}
            <Users className="h-4 w-4 shrink-0 text-tg-secondary" />
            <span className="text-sm font-bold text-tg-text">ویدیوهای گروه (لینک‌نشده)</span>
            <span className="mr-auto rounded-full bg-tg-hover px-2 py-0.5 text-[10px] text-tg-secondary">{data?.group.length} فایل</span>
          </button>
          {groupOpen && (
            <div className="space-y-1.5 border-t border-tg-border pt-2">
              {(data?.group ?? []).map((g) => <FileRow key={g.id} item={g} />)}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
