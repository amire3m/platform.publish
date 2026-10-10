"use client";
import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Search, Film, Image as ImageIcon, Scissors, Smartphone, ChevronDown, ChevronLeft,
  FolderOpen, Folder, Package, Tv, Users, Play, Music, Plus,
} from "lucide-react";
import { Button, Card, Input, Label, Select, EmptyState, Skeleton, Modal } from "@/components/ui";
import { ChannelOptions } from "@/components/ChannelOptions";
import { MirrorStatusBox } from "@/components/library/MirrorStatus";
import { DedicatedPlayer } from "@/components/media/DedicatedPlayer";
import { ResumableUploader } from "@/components/media/ResumableUploader";
import { timedFetch } from "@/lib/fetch-timeout";

const fetcher = async (url: string) => {
  const res = await timedFetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا");
  return body.data;
};

interface FileItem {
  id: string;
  filename: string;
  type: "full_video" | "highlight" | "reel" | "cover" | string;
  playbackUrl: string;
  mirrorUrl?: string | null;
  fileId?: string | null;
  createdAt: string;
  telegramLink?: string;
  assetId?: string | null;
  version?: number | null;
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

export function FilePreview({ item, onRefresh }: { item: FileItem; onRefresh?: () => void }) {
  const [failed, setFailed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  async function handlePrepare() {
    if (!item.fileId) return;
    setPreparing(true);
    setPrepareError(null);
    try {
      const res = await fetch("/api/media/warm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: item.fileId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "آماده‌سازی ناموفق بود.");
      onRefresh?.();
      setFailed(false);
      setRetryKey((k) => k + 1);
    } catch (e) {
      setPrepareError(e instanceof Error ? e.message : "آماده‌سازی ناموفق بود.");
    } finally {
      setPreparing(false);
    }
  }

  if (item.type === "cover") {
    return (
      <div className="w-52 overflow-hidden rounded-lg border border-tg-border bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.playbackUrl} alt={item.filename} className="max-h-40 w-full object-contain" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className="w-96 max-w-full overflow-hidden rounded-lg border border-tg-border bg-black">
      {failed ? (
        <div className="flex min-h-36 flex-col items-center justify-center gap-1.5 p-3 text-white">
          <p className="text-[11px]">پخش مستقیم برای این فایل ممکن نشد.</p>
          {prepareError && (
            <p className="text-[11px] text-rose-300" role="alert">
              {prepareError}
            </p>
          )}
          {item.fileId && !item.fileId.startsWith("tg_msg_") && (
            <button
              type="button"
              onClick={handlePrepare}
              disabled={preparing}
              className="rounded bg-tg-accent px-3 py-1 text-[11px] font-medium disabled:opacity-50"
            >
              {preparing ? "در حال آماده‌سازی..." : "آماده‌سازی ویدیو"}
            </button>
          )}
          {item.telegramLink && (
            <a href={item.telegramLink} target="_blank" rel="noopener noreferrer" className="rounded bg-tg-accent px-2 py-0.5 text-[11px]">مشاهده در تلگرام</a>
          )}
        </div>
      ) : (
        <DedicatedPlayer
          key={retryKey}
          src={item.mirrorUrl ?? item.playbackUrl}
          fallbackSrc={item.mirrorUrl ? item.playbackUrl : undefined}
          title={item.filename}
          className="aspect-video w-full"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function FileRow({ item }: { item: FileItem }) {
  const [open, setOpen] = useState(false);
  const { mutate } = useSWRConfig();
  const refreshLibrary = () => {
    void mutate((key) => typeof key === "string" && key.startsWith("/api/library"));
  };
  const meta = TYPE_META[item.type] ?? TYPE_META.full_video;
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-tg-border bg-tg-surface/60">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-right">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.cls}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-tg-text" title={item.filename}>{item.filename}</span>
        {item.version != null && (
          <span className="shrink-0 rounded-full bg-tg-hover px-2 py-0.5 text-[10px] text-tg-secondary">نسخه {item.version}</span>
        )}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${meta.cls}`}>{meta.label}</span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <Play className="h-3.5 w-3.5 shrink-0 text-tg-secondary" />}
      </button>
          {open && (
            <div className="border-t border-tg-border p-2">
              <FilePreview item={item} onRefresh={refreshLibrary} />
              <p className="mt-1 text-[10px] text-tg-secondary">{new Date(item.createdAt).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" })}</p>
            </div>
          )}
    </div>
  );
}

function PartSection({ part, productId, channel }: { part: PartNode; productId: string; channel: string }) {
  const [open, setOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { mutate } = useSWRConfig();
  const refreshLibrary = () => {
    void mutate((key) => typeof key === "string" && key.startsWith("/api/library"));
  };
  const count = (part.fullVideo ? 1 : 0) + part.highlights.length + part.reels.length + (part.cover ? 1 : 0);
  return (
    <div className="rounded-lg border border-tg-border bg-tg-hover/20">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-right">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <ChevronLeft className="h-4 w-4 shrink-0 text-tg-secondary" />}
        <span className="text-xs font-bold text-tg-text">قسمت {part.partNumber}</span>
        <span className="mr-auto rounded-full bg-tg-hover px-2 py-0.5 text-[10px] text-tg-secondary">{count} فایل</span>
      </button>
      {open && (
        <div className="grid gap-1.5 border-t border-tg-border p-2 sm:grid-cols-2">
          {part.fullVideo && <FileRow item={part.fullVideo} />}
          {part.highlights.map((h) => <FileRow key={h.id} item={h} />)}
          {part.reels.map((r) => <FileRow key={r.id} item={r} />)}
          {part.cover && <FileRow item={part.cover} />}
          {count === 0 && <p className="px-2 py-1 text-[11px] text-tg-secondary">فایلی ثبت نشده است.</p>}
          <div className="sm:col-span-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setUploadOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> آپلود نسخه جدید (تا ۸ گیگابایت)
            </Button>
          </div>
        </div>
      )}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title={`آپلود نسخه جدید — قسمت ${part.partNumber}`}>
        <ResumableUploader
          binding={{ partId: part.partId, productId, channel }}
          onDone={() => {
            setUploadOpen(false);
            refreshLibrary();
          }}
        />
      </Modal>
    </div>
  );
}

function ProductSection({ product, channel }: { product: ProductNode; channel: string }) {
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
          {product.parts.map((p) => <PartSection key={p.partId} part={p} productId={product.productId} channel={channel} />)}
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
          {products.map((p) => <ProductSection key={p.productId} product={p} channel={channel.channel} />)}
          {products.length === 0 && <p className="py-2 text-center text-[11px] text-tg-secondary">محصولی یافت نشد.</p>}
        </div>
      )}
    </Card>
  );
}

interface MusicItem {
  id: string;
  title: string;
  fileRef: string;
  fileName: string | null;
  telegramLink: string | null;
  usedInParts: number;
  playbackUrl: string | null;
  createdAt: string | null;
}

function MusicSection() {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { data, isLoading, mutate } = useSWR<{ items: MusicItem[] }>("/api/music", fetcher);
  const items = data?.items ?? [];

  async function register() {
    if (!title.trim() || !link.trim()) {
      setFormError("عنوان و لینک تلگرام الزامی است.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await timedFetch("/api/music", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), telegramLink: link.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا در ثبت موسیقی");
      setTitle("");
      setLink("");
      setFormOpen(false);
      mutate();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-2 p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-right">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-tg-secondary" /> : <ChevronLeft className="h-4 w-4 shrink-0 text-tg-secondary" />}
        <Music className="h-4 w-4 shrink-0 text-tg-secondary" />
        <span className="text-sm font-bold text-tg-text">کتابخانه موسیقی (مشترک همه کانال‌ها)</span>
        <span className="mr-auto rounded-full bg-tg-hover px-2 py-0.5 text-[10px] text-tg-secondary">{items.length} فایل</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-tg-border pt-2">
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            ثبت موسیقی جدید
          </Button>
          {isLoading && <p className="text-xs text-tg-secondary">در حال بارگذاری…</p>}
          {items.map((m) => (
            <div key={m.id} className="rounded-lg border border-tg-border p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-tg-text">{m.title}</p>
                <span className="shrink-0 text-[10px] text-tg-secondary">استفاده در {m.usedInParts} قسمت</span>
              </div>
              {m.playbackUrl ? (
                <audio controls preload="none" src={m.playbackUrl} className="mt-1 w-full" />
              ) : (
                <p className="mt-1 text-[11px] text-tg-secondary">پخش مستقیم در دسترس نیست.</p>
              )}
            </div>
          ))}
          {!isLoading && items.length === 0 && <p className="text-xs text-tg-secondary">هنوز موسیقی ثبت نشده است.</p>}
        </div>
      )}
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
          {formError && <p className="text-xs text-rose-600">{formError}</p>}
          <Button className="w-full" onClick={register} disabled={saving}>
            {saving ? "در حال ثبت…" : "ثبت در کتابخانه"}
          </Button>
        </div>
      </Modal>
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

      <MirrorStatusBox />

      <MusicSection />

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
