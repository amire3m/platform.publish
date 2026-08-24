"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Search, Grid3X3, List, X, Tag, Film, Image as ImageIcon, Layers, ExternalLink, Play, Eye } from "lucide-react";
import { Button, Card, Input, Select, Modal, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { CHANNELS } from "@/lib/channels";
import type { Asset, AssetType } from "@/lib/assets/types";
import { UNKNOWN_LABEL_FA } from "@/lib/presentation-fa";
import { ChannelOptions } from "@/components/ChannelOptions";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا در دریافت کتابخانه");
  return body.data as Asset[];
};

const detailFetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا");
  return body.data as Asset;
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} مگابایت`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} کیلوبایت`;
  return `${bytes} بایت`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fa-IR");
  } catch {
    return iso;
  }
}

function typeLabel(type: AssetType): string {
  if (type === "video") return "ویدئو";
  if (type === "image") return "تصویر";
  if (type === "cover") return "کاور";
  return UNKNOWN_LABEL_FA;
}

function TypeBadge({ type }: { type: AssetType }) {
  const color =
    type === "video" ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : type === "cover" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{typeLabel(type)}</span>;
}

export default function AssetsPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [type, setType] = useState("");
  const [channel, setChannel] = useState("");
  const [tag, setTag] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tagEditor, setTagEditor] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQuery) p.set("q", debouncedQuery);
    if (type) p.set("type", type);
    if (channel) p.set("channel", channel);
    if (tag.trim()) p.set("tag", tag.trim());
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [debouncedQuery, type, channel, tag]);

  const url = `/api/assets${qs}`;
  const { data, error, isLoading, mutate } = useSWR<Asset[]>(url, fetcher);
  const assets = data ?? [];

  const { data: selectedAsset, mutate: mutateSelected } = useSWR<Asset>(selectedId ? `/api/assets/${selectedId}` : null, detailFetcher);
  const displayAsset = selectedAsset ?? assets.find((a) => a.id === selectedId) ?? null;

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) for (const t of a.tags) set.add(t);
    return Array.from(set);
  }, [assets]);

  async function handleAddTag() {
    if (!selectedId || !tagEditor.trim()) return;
    const t = tagEditor.trim();
    const res = await fetch(`/api/assets/${selectedId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: t }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      alert(body.error ?? "خطا در افزودن برچسب");
      return;
    }
    setTagEditor("");
    mutate();
    mutateSelected();
  }

  const previewUrl = displayAsset?.thumbnailUrl ?? null;
  // For video, if thumbnailUrl is null (sample), we show placeholder; real assets will have signed url
  const isSample = displayAsset?.telegramFileId?.startsWith("sample_") ?? false;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">کتابخانه</h1>
          <p className="text-sm text-tg-secondary">دارایی‌های ذخیره‌شده در تلگرام — تصویر، کاور و ویدئو — قابل جستجو و برچسب‌گذاری</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={view === "grid" ? "primary" : "secondary"} size="sm" className="min-h-[44px] min-w-[44px]" onClick={() => setView("grid")} aria-label="نمای شبکه‌ای">
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button variant={view === "list" ? "primary" : "secondary"} size="sm" className="min-h-[44px] min-w-[44px]" onClick={() => setView("list")} aria-label="نمای فهرست">
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tg-secondary" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو بر اساس نام، برچسب یا شناسه..." className="min-h-[44px] pr-9" aria-label="جستجو" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="min-h-[44px]" aria-label="فیلتر نوع">
            <option value="">همه نوع‌ها</option>
            <option value="video">ویدئو</option>
            <option value="image">تصویر</option>
            <option value="cover">کاور</option>
          </Select>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="min-h-[44px]" aria-label="فیلتر کانال">
            <option value="">همه کانال‌ها</option>
            <ChannelOptions />
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex min-h-[44px] flex-1 items-center gap-2">
            <Tag className="h-4 w-4 shrink-0 text-tg-secondary" />
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="فیلتر برچسب (مثال: تیزر، کاور)" className="min-h-[44px] flex-1" aria-label="فیلتر برچسب" />
            {tag && (
              <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => setTag("")} aria-label="پاک کردن برچسب">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {allTags.slice(0, 8).map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(t)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${tag === t ? "border-tg-accent bg-tg-accent text-tg-accent-fg" : "border-tg-border bg-tg-hover text-tg-secondary hover:text-tg-text"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        {(debouncedQuery || type || channel || tag) && (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              onClick={() => {
                setQuery("");
                setType("");
                setChannel("");
                setTag("");
              }}
            >
              پاک کردن فیلترها
            </Button>
          </div>
        )}
      </Card>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      )}

      {error && !isLoading && (
        <div className="space-y-3">
          <ErrorState message={(error as Error).message ?? "خطا در دریافت کتابخانه"} />
          <Button variant="secondary" onClick={() => mutate()} className="min-h-[44px]">
            تلاش دوباره
          </Button>
        </div>
      )}

      {!isLoading && !error && assets.length === 0 && (
        <EmptyState title="دارایی‌ای یافت نشد" description="فیلترها را تغییر دهید یا بعداً دوباره بررسی کنید. دارایی‌ها از پیام‌های تلگرام و قسمت‌های اتاق محتوا جمع‌آوری می‌شوند." />
      )}

      {!isLoading && !error && assets.length > 0 && view === "grid" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((a) => (
            <Card key={a.id} className="flex flex-col gap-3 p-4">
              <div
                className="relative flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-tg-border bg-tg-hover"
                onClick={() => {
                  setSelectedId(a.id);
                  setPreviewOpen(true);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSelectedId(a.id);
                    setPreviewOpen(true);
                  }
                }}
                aria-label={`پیش‌نمایش ${a.filename}`}
              >
                {a.type === "video" ? (
                  <Film className="h-10 w-10 text-tg-secondary" />
                ) : a.type === "cover" ? (
                  <Layers className="h-10 w-10 text-tg-secondary" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-tg-secondary" />
                )}
                {/* overlay hint */}
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">پیش‌نمایش</span>
                {/* show proxy image if available */}
                {a.type !== "video" && a.thumbnailUrl && !a.telegramFileId.startsWith("sample_") ? (
                  <img src={a.thumbnailUrl} alt={a.filename} className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <TypeBadge type={a.type} />
                  <span className="text-[11px] text-tg-secondary">v{a.version}</span>
                </div>
                <p className="line-clamp-1 text-sm font-semibold text-tg-text" title={a.filename}>
                  {a.filename}
                </p>
                <p className="text-xs text-tg-secondary">
                   {formatSize(a.size)} · {formatDate(a.createdAt)} {a.channelId ? `· ${CHANNELS.find((c) => c.id === a.channelId)?.labelFa ?? UNKNOWN_LABEL_FA}` : ""}
                </p>
                <p className="line-clamp-1 text-xs text-tg-secondary">{a.id}</p>
                <div className="flex flex-wrap gap-1">
                  {a.tags.map((t) => (
                    <span key={t} className="rounded-full bg-tg-hover px-2 py-0.5 text-[11px] text-tg-secondary">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-auto flex gap-2">
                <Button variant="secondary" size="sm" className="min-h-[44px] flex-1" onClick={() => { setSelectedId(a.id); setPreviewOpen(true); }}>
                  <Eye className="h-3.5 w-3.5" />
                  جزئیات
                </Button>
                <Link href={`/content-room/new?assetId=${encodeURIComponent(a.id)}`} className="flex-1">
                  <Button size="sm" className="min-h-[44px] w-full">
                    <ExternalLink className="h-3.5 w-3.5" />
                    استفاده در محتوا
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && !error && assets.length > 0 && view === "list" && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tg-border text-right text-xs text-tg-secondary">
                <th className="px-4 py-3 font-semibold">نام</th>
                <th className="px-4 py-3 font-semibold">نوع</th>
                <th className="px-4 py-3 font-semibold">کانال</th>
                <th className="px-4 py-3 font-semibold">حجم</th>
                <th className="px-4 py-3 font-semibold">نسخه</th>
                <th className="px-4 py-3 font-semibold">برچسب‌ها</th>
                <th className="px-4 py-3 font-semibold">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-tg-border/60 last:border-0 hover:bg-tg-hover/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-tg-text">{a.filename}</p>
                    <p className="text-xs text-tg-secondary">{a.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={a.type} />
                  </td>
                  <td className="px-4 py-3 text-tg-secondary">{a.channelId ? CHANNELS.find((c) => c.id === a.channelId)?.labelFa ?? UNKNOWN_LABEL_FA : "—"}</td>
                  <td className="px-4 py-3 text-tg-secondary">{formatSize(a.size)}</td>
                  <td className="px-4 py-3 text-tg-secondary">v{a.version}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {a.tags.map((t) => (
                        <span key={t} className="rounded-full bg-tg-hover px-2 py-0.5 text-[11px] text-tg-secondary">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button variant="secondary" size="sm" className="min-h-[44px]" onClick={() => { setSelectedId(a.id); setPreviewOpen(true); }}>
                        پیش‌نمایش
                      </Button>
                      <Link href={`/content-room/new?assetId=${encodeURIComponent(a.id)}`}>
                        <Button size="sm" className="min-h-[44px]">
                          استفاده
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Detail / Preview Modal */}
      <Modal
        open={previewOpen && !!displayAsset}
        onClose={() => setPreviewOpen(false)}
        title={displayAsset ? displayAsset.filename : "جزئیات دارایی"}
        footer={
          displayAsset ? (
            <>
              <Button variant="secondary" onClick={() => setPreviewOpen(false)} className="min-h-[44px]">
                بستن
              </Button>
              <Link href={`/content-room/new?assetId=${encodeURIComponent(displayAsset.id)}`}>
                <Button className="min-h-[44px]">استفاده در محتوا</Button>
              </Link>
            </>
          ) : undefined
        }
      >
        {!displayAsset ? (
          <p className="text-sm text-tg-secondary">در حال بارگذاری...</p>
        ) : (
          <div className="space-y-4">
            {/* Preview area */}
            <div className="overflow-hidden rounded-lg border border-tg-border bg-black">
              {displayAsset.type === "video" ? (
                isSample || !previewUrl ? (
                  <div className="flex h-48 items-center justify-center bg-zinc-900 text-white">
                    <div className="text-center">
                      <Play className="mx-auto h-10 w-10 opacity-60" />
                      <p className="mt-2 text-xs opacity-70">پیش‌نمایش ویدئو — فایل نمونه (بدون توکن تلگرام)</p>
                      <p className="text-[11px] opacity-50">{displayAsset.telegramFileId}</p>
                    </div>
                  </div>
                ) : (
                  <video controls className="max-h-64 w-full" src={previewUrl} preload="metadata" />
                )
              ) : isSample || !previewUrl ? (
                <div className="flex h-48 items-center justify-center bg-zinc-900 text-white">
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-10 w-10 opacity-60" />
                    <p className="mt-2 text-xs opacity-70">پیش‌نمایش تصویر — فایل نمونه</p>
                    <p className="text-[11px] opacity-50">{displayAsset.filename}</p>
                  </div>
                </div>
              ) : (
                <img src={previewUrl} alt={displayAsset.filename} className="max-h-64 w-full object-contain" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-semibold text-tg-secondary">شناسه</p>
                <p className="text-tg-text">{displayAsset.id}</p>
              </div>
              <div>
                <p className="font-semibold text-tg-secondary">نوع</p>
                <p className="text-tg-text">{typeLabel(displayAsset.type)}</p>
              </div>
              <div>
                <p className="font-semibold text-tg-secondary">حجم</p>
                <p className="text-tg-text">{formatSize(displayAsset.size)}</p>
              </div>
              <div>
                <p className="font-semibold text-tg-secondary">نوع فایل</p>
                <p className="text-tg-text">{displayAsset.mime}</p>
              </div>
              <div>
                <p className="font-semibold text-tg-secondary">کانال</p>
                <p className="text-tg-text">{displayAsset.channelId ? CHANNELS.find((c) => c.id === displayAsset.channelId)?.labelFa ?? UNKNOWN_LABEL_FA : "—"}</p>
              </div>
              <div>
                <p className="font-semibold text-tg-secondary">تاریخ</p>
                <p className="text-tg-text">{formatDate(displayAsset.createdAt)}</p>
              </div>
              <div className="col-span-2">
                <p className="font-semibold text-tg-secondary">شناسه فایل Telegram</p>
                <p className="break-all font-mono text-[11px] text-tg-text">{displayAsset.telegramFileId}</p>
              </div>
            </div>

            {/* Tags */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-tg-secondary">برچسب‌ها</p>
              <div className="flex flex-wrap gap-1.5">
                {displayAsset.tags.length === 0 ? <span className="text-xs text-tg-secondary">بدون برچسب</span> : displayAsset.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-tg-hover px-2.5 py-1 text-xs text-tg-text">
                    <Tag className="h-3 w-3" />
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Input value={tagEditor} onChange={(e) => setTagEditor(e.target.value)} placeholder="برچسب جدید..." className="min-h-[44px] flex-1" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }} />
                <Button onClick={handleAddTag} disabled={!tagEditor.trim()} className="min-h-[44px]">
                  افزودن
                </Button>
              </div>
            </div>

            {/* Versions */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-tg-secondary">نسخه‌ها</p>
              <div className="space-y-1">
                {(displayAsset.versions ?? []).length === 0 ? <p className="text-xs text-tg-secondary">بدون نسخه</p> : (displayAsset.versions ?? []).map((v) => (
                  <div key={v.version} className="flex items-center justify-between rounded-lg border border-tg-border px-3 py-2 text-xs">
                    <span className="font-medium text-tg-text">v{v.version}</span>
                    <span className="font-mono text-[11px] text-tg-secondary">{v.telegramFileId.slice(0, 24)}{v.telegramFileId.length > 24 ? "…" : ""}</span>
                    <span className="text-tg-secondary">{formatDate(v.createdAt)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-tg-secondary">نسخه‌های فایل به‌صورت پیام در Telegram ذخیره می‌شوند و هر شناسه فایل جدید، یک نسخه جداگانه می‌سازد.</p>
            </div>

            {displayAsset.thumbnailUrl && !isSample && <p className="text-[11px] text-tg-secondary">فایل از مخزن امن Telegram نمایش داده می‌شود.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
