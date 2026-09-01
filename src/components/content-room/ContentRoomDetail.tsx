"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Pencil, UploadCloud, Film, Image as ImageIcon, Scissors, Smartphone, Hash, X, Play } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { DedicatedPlayer } from "@/components/media/DedicatedPlayer";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import { contentStatusPresentation } from "@/lib/content-room/presentation";
import type { ContentStatus } from "@/lib/content-room/presentation";
import type { ContentRoomProductDetail } from "./types";
import { channelLabelFa, productTypeLabelFa, getProductProgressFromActivities, getNextActionFromActivities } from "./room-model";
import { DELIVERABLE_KIND_TO_PLATFORM, getChannelAccounts, getChannelConfig } from "@/lib/channels";
import { platformLabelFa } from "@/lib/presentation-fa";
import { PartActivitiesGrid } from "./PartActivitiesGrid";
import { EditProductDialog } from "./EditProductDialog";

interface Props {
  product: ContentRoomProductDetail;
  onRefresh: () => Promise<void> | void;
}

export function ContentRoomDetail({ product, onRefresh }: Props) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ programId: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"checklist" | "files" | "group">("checklist");

  const currentStatus = product.status as ContentStatus;
  const pres = contentStatusPresentation(currentStatus);
  const progress = getProductProgressFromActivities(product as never);
  const nextAction = getNextActionFromActivities(product as never);

  const isReadyToSend = product.status === "ready_to_send";
  const channelConfig = getChannelConfig(product.channel);
  const channelAccounts = getChannelAccounts(product.channel);
  const { data: channelsData } = useSWR<{ channels: Array<{ id: string; labelFa: string; youtubeAccountId: string | null; instagramAccountId: string | null; telegramTopicId: string | null; linked?: { youtube: boolean; instagram: boolean; telegram: boolean } }> }>(
    "/api/channels",
    async (url: string) => {
      try {
        const res = await fetch(url);
        const body = await res.json();
        if (body.ok) return body.data;
        return null;
      } catch {
        return null;
      }
    },
  );
  const liveChannel = channelsData?.channels?.find((c) => c.id === product.channel);
  const ytId = liveChannel?.youtubeAccountId ?? channelAccounts.youtubeAccountId;
  const igId = liveChannel?.instagramAccountId ?? channelAccounts.instagramAccountId;
  const tgId = liveChannel?.telegramTopicId ?? channelAccounts.telegramTopicId;

  async function handleToggle(partId: string, activity: string, isDone: boolean) {
    setActionError(null);
    try {
      await fetchContentRoomApi(`/api/content-room/parts/${partId}/activities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity, isDone, expectedProductVersion: product.version }),
      });
      await onRefresh();
    } catch (e) {
      const isConflict = e instanceof ContentRoomApiError && e.status === 409;
      if (isConflict) {
        setActionError("اطلاعات توسط کاربر دیگری تغییر کرده است. لطفاً صفحه را تازه‌سازی کنید.");
        await onRefresh();
      } else {
        setActionError(e instanceof ContentRoomApiError ? e.message : e instanceof Error ? e.message : "خطا در تغییر فعالیت");
      }
    }
  }

  async function handleSend() {
    setSendLoading(true);
    setActionError(null);
    try {
      const data = await fetchContentRoomApi<{ programId: string; product: unknown; program: unknown }>(
        `/api/content-room/products/${product.id}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: product.version }),
        },
      );
      setSendResult({ programId: data.programId });
      setToast("محصول با موفقیت به اتاق انتشار ارسال شد.");
      setTimeout(() => setToast(null), 4000);
      await onRefresh();
    } catch (e) {
      const isConflict = e instanceof ContentRoomApiError && e.status === 409;
      if (isConflict) {
        setActionError("اطلاعات توسط کاربر دیگری تغییر کرده است");
        await onRefresh();
      } else {
        setActionError(e instanceof ContentRoomApiError ? e.message : e instanceof Error ? e.message : "خطا در ارسال به انتشار");
      }
    } finally {
      setSendLoading(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-tg-text">{product.title}</h1>
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)} className="shrink-0" aria-label="ویرایش محصول">
                <Pencil className="h-3.5 w-3.5" />
                ویرایش
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-tg-secondary">
              <span className="rounded-full bg-tg-hover px-2.5 py-1">{productTypeLabelFa(product.productType)}</span>
              <span className="rounded-full bg-tg-hover px-2.5 py-1">{channelLabelFa(product.channel)}</span>
              <span className="rounded-full bg-tg-hover px-2.5 py-1">{product.partsCount} قسمت</span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  pres.tone === "success"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : pres.tone === "warning"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      : pres.tone === "info"
                        ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
                        : "bg-slate-500/10 text-slate-600 dark:text-slate-300"
                }`}
              >
                {pres.label}
              </span>
              {nextAction && <span className="rounded-full bg-tg-accent/10 px-2.5 py-1 text-tg-accent">اقدام بعدی: {nextAction}</span>}
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-tg-secondary">پیشرفت</span>
                <span className="font-medium text-tg-text">{progress.label}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-tg-hover">
                <div className="h-full rounded-full bg-tg-accent" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
            {product.notes && <p className="mt-3 text-sm leading-relaxed text-tg-text/80">{product.notes}</p>}
            <div className="mt-4 rounded-lg border border-tg-border bg-tg-surface p-3">
              <p className="text-xs font-semibold text-tg-secondary">حساب‌های مقصد برای کانال «{channelConfig?.labelFa ?? channelLabelFa(product.channel)}»</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div className="rounded-md bg-tg-hover/30 px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-tg-secondary">یوتیوب</p>
                  <p className="mt-1 truncate font-mono text-xs text-tg-text" title={ytId ?? ""}>
                    {ytId ? ytId.slice(0, 24) : "تنظیم نشده"}
                  </p>
                  <p className="mt-1 text-[11px] text-tg-secondary">
                    یوتیوب کامل + هایلایت ← {platformLabelFa(DELIVERABLE_KIND_TO_PLATFORM["youtube_full"])}، {platformLabelFa(DELIVERABLE_KIND_TO_PLATFORM["highlight"])}
                  </p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${ytId ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
                    {ytId ? "متصل" : "بدون حساب متصل"}
                  </span>
                </div>
                <div className="rounded-md bg-tg-hover/30 px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-tg-secondary">اینستاگرام</p>
                  <p className="mt-1 truncate font-mono text-xs text-tg-text" title={igId ?? ""}>
                    {igId ? igId.slice(0, 24) : "تنظیم نشده"}
                  </p>
                  <p className="mt-1 text-[11px] text-tg-secondary">ریلز + کاور ← {platformLabelFa(DELIVERABLE_KIND_TO_PLATFORM["reel"])}، {platformLabelFa(DELIVERABLE_KIND_TO_PLATFORM["cover"])}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${igId ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
                    {igId ? "متصل" : "بدون حساب متصل"}
                  </span>
                </div>
                <div className="rounded-md bg-tg-hover/30 px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-tg-secondary">تلگرام</p>
                  <p className="mt-1 truncate font-mono text-xs text-tg-text" title={tgId ?? ""}>
                    {tgId ? tgId : "تنظیم نشده"}
                  </p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${
                      tgId
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-slate-500/10 text-slate-500"
                    }`}
                  >
                    {tgId ? "متصل" : "اختیاری"}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-tg-secondary">با ارسال برای انتشار، برای هر خروجی یک مقصد انتشار در پلتفرم انتخاب‌شده ایجاد می‌شود. اگر حسابی متصل نباشد، مقصد بدون حساب باقی می‌ماند.</p>
            </div>
          </div>
        </div>

        {actionError && (
          <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {actionError}
          </div>
        )}
        {toast && (
          <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {toast}
          </div>
        )}

        {sendResult && (
          <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            ارسال با موفقیت انجام شد.{" "}
            <Link href={`/workflow/${sendResult.programId}`} className="font-semibold text-tg-accent hover:underline">
              مشاهده در اتاق انتشار
            </Link>
          </div>
        )}

        {!sendResult && product.sentProgram && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-700 dark:text-sky-300">
            <span>این محصول قبلاً به اتاق انتشار ارسال شده است.</span>
            <Link href={`/workflow/${product.sentProgram.id}`} className="font-semibold text-tg-accent hover:underline">
              مشاهده برنامه در اتاق انتشار
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSend}
            disabled={!isReadyToSend || sendLoading}
            className="min-h-[44px]"
            title={!isReadyToSend ? "فقط در وضعیت آماده ارسال امکان ارسال وجود دارد" : "ارسال به انتشار"}
          >
            {sendLoading ? "در حال ارسال..." : "ارسال به انتشار"}
          </Button>
          {!isReadyToSend && <span className="self-center text-xs text-tg-secondary">فقط وقتی همه فعالیت‌های لازم برای قسمت‌های فعال تکمیل شود فعال است.</span>}
        </div>
      </Card>

      <div className="flex gap-2 border-b border-tg-border">
        {[
          { key: "checklist", label: "چک‌لیست" },
          { key: "files", label: `فایل‌ها (${product.parts?.filter((p) => (p as { isActive?: boolean }).isActive ?? true).length ?? 0} قسمت)` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as never)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${activeTab === t.key ? "border-tg-accent text-tg-accent" : "border-transparent text-tg-secondary hover:text-tg-text"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "checklist" && (
        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-tg-text">چک‌لیست فعالیت‌ها (هر قسمت مستقل)</h2>
          <PartActivitiesGrid parts={product.parts as never} onToggle={handleToggle} />
        </Card>
      )}

      {activeTab === "files" && (
        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-tg-text">قسمت‌ها (آپلود فایل)</h2>
        {product.parts && product.parts.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...product.parts]
              .sort((a, b) => a.partNumber - b.partNumber)
              .filter((p) => (p as { isActive?: boolean }).isActive ?? true)
              .map((part) => (
                <PartUploadCard key={part.id} part={part} onRefresh={onRefresh} onError={setActionError} onToast={setToast} />
              ))}
          </div>
        ) : (
          <p className="text-sm text-tg-secondary">قسمتی ثبت نشده است.</p>
        )}
        {product.parts && product.parts.some((p) => (p as { isActive?: boolean }).isActive === false) && (
          <p className="text-xs text-tg-secondary">قسمت‌های پنهان (کاهش تعداد قسمت) فایل‌ها و تیک‌های قبلی را حفظ کرده‌اند؛ با افزایش تعداد قسمت دوباره فعال می‌شوند.</p>
        )}
      </Card>
      )}

      <EditProductDialog open={editOpen} product={product} onClose={() => setEditOpen(false)} onSuccess={onRefresh} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Beautiful drop-zone upload card
// ---------------------------------------------------------------------------
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} گیگابایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}

function UploadZone({
  icon: Icon,
  title,
  hint,
  accept,
  file,
  onSelect,
  onClear,
  onUpload,
  actionLabel,
  accentBg,
  accentText,
  accentBorder,
  isUploading,
  progress,
  loaded,
  total,
  speed,
  onCancel,
  children,
}: {
  icon: typeof Film;
  title: string;
  hint: string;
  accept: string;
  file: File | null;
  onSelect: (f: File | null) => void;
  onClear: () => void;
  onUpload: () => void;
  actionLabel: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  isUploading: boolean;
  progress: number;
  loaded: number;
  total: number;
  speed: number;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function pick(f: File | null) {
    onSelect(f);
  }

  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${accentBorder} ${dragOver ? "bg-tg-accent/5" : "bg-transparent"}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accentBg} ${accentText}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-tg-text">{title}</p>
          <p className="truncate text-[11px] text-tg-secondary" title={hint}>{hint}</p>
        </div>
      </div>

      {/* Drop zone / file chip */}
      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0] ?? null;
            if (f) pick(f);
          }}
          className={`flex min-h-[72px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3 text-center transition-colors ${
            dragOver ? "border-tg-accent bg-tg-accent/10" : "border-tg-border bg-tg-hover/30 hover:border-tg-accent/60 hover:bg-tg-hover/50"
          }`}
        >
          <UploadCloud className="h-5 w-5 text-tg-secondary" />
          <span className="text-xs text-tg-secondary">فایل را بکشید یا <span className="font-semibold text-tg-accent">انتخاب کنید</span></span>
        </button>
      ) : (
        <div className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${accentBg}`}>
          <div className="flex min-w-0 items-center gap-2">
            <Icon className={`h-4 w-4 shrink-0 ${accentText}`} />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-tg-text" title={file.name}>{file.name}</p>
              <p className="text-[10px] text-tg-secondary">{formatBytes(file.size)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onClear(); if (inputRef.current) inputRef.current.value = ""; }}
            disabled={isUploading}
            aria-label="حذف فایل انتخاب‌شده"
            className="shrink-0 rounded p-1 text-tg-secondary hover:bg-tg-hover hover:text-tg-text disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        className="hidden"
      />

      {isUploading && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-tg-secondary">
            <span>{formatBytes(loaded)} / {formatBytes(total)}</span>
            <span>{speed > 0 ? `${(speed / (1024 * 1024)).toFixed(2)} MB/s` : `${progress}٪`}</span>
            <button onClick={onCancel} className="text-rose-600 hover:underline">لغو</button>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-tg-hover">
            <div className={`h-full ${accentBg.replace("text-", "bg-").split(" ")[0]} transition-all duration-150`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <Button
        size="sm"
        onClick={onUpload}
        disabled={!file || (isUploading || false)}
        className="min-h-[36px] w-full text-xs"
      >
        {isUploading ? `در حال آپلود… ${progress}٪` : actionLabel}
      </Button>

      {children}
    </div>
  );
}

function PartUploadCard({
  part,
  onRefresh,
  onError,
  onToast,
}: {
  part: {
    id: string;
    partNumber: number;
    fileRef?: string | null;
    coverFileRef?: string | null;
    highlightFileRef?: string | null;
    reelFileRef?: string | null;
    playbackUrl?: string | null;
    coverUrl?: string | null;
    highlightUrl?: string | null;
    reelUrl?: string | null;
    version?: number | null;
    status?: string | null;
  };
  onRefresh: () => Promise<void> | void;
  onError: (msg: string | null) => void;
  onToast: (msg: string | null) => void;
}) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [highlightFile, setHighlightFile] = useState<File | null>(null);
  const [reelFile, setReelFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<"video" | "cover" | "highlight" | "reel" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadLoaded, setUploadLoaded] = useState<number>(0);
  const [uploadTotal, setUploadTotal] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [highlightPreviewUrl, setHighlightPreviewUrl] = useState<string | null>(null);
  const [reelPreviewUrl, setReelPreviewUrl] = useState<string | null>(null);

  const hasVideo = Boolean(part.fileRef);
  const hasCover = Boolean(part.coverFileRef);
  const { data: assetsData, mutate: mutateAssets } = useSWR<{ ok: boolean; data: { assets: Array<{ id: string; kind: string; fileRef: string; fileName: string | null; createdAt: string }> } }>(
    `/api/content-room/parts/${part.id}/assets`,
    async (url: string) => {
      const res = await fetch(url);
      const json = await res.json();
      return json;
    },
  );
  const highlights = assetsData?.data?.assets?.filter((a) => a.kind === "highlight") ?? [];
  const reels = assetsData?.data?.assets?.filter((a) => a.kind === "reel") ?? [];
  // keep legacy single-ref badge for migrated rows that haven't been moved
  const hasHighlight = highlights.length > 0 || Boolean(part.highlightFileRef);
  const hasReel = reels.length > 0 || Boolean(part.reelFileRef);

  const { data: groupMediaData, mutate: mutateGroupMedia } = useSWR<{
    ok: boolean;
    data: {
      items: Array<{
        messageId: string;
        fileId: string | null;
        fileName: string | null;
        mime: string | null;
        date: string | null;
        caption: string | null;
        topicName?: string | null;
        thumbUrl?: string | null;
        durationSec?: number | null;
        playUrl?: string | null;
        linked?: boolean;
        linkedTo?: { partId: string; partNumber: number | null; productTitle: string | null } | null;
        telegramLink?: string;
      }>;
    };
  }>(
    "/api/telegram/group-media?limit=24",
    async (url: string) => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        return json;
      } catch {
        return null;
      }
    },
    { refreshInterval: 60000 },
  );
  const groupItems = groupMediaData?.data?.items ?? [];
  const [groupOnlyUnlinked, setGroupOnlyUnlinked] = useState(true);
  const [previewItem, setPreviewItem] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  // Two-mode attach state: paste link / await reply (with TTL countdown)
  const [attachMode, setAttachMode] = useState<"idle" | "link" | "reply">("idle");
  const [attachKind, setAttachKind] = useState<"video" | "cover" | "highlight" | "reel">("video");
  const [tgLink, setTgLink] = useState("");
  const [awaitTtl, setAwaitTtl] = useState(0);

  function startAttach(kind: "video" | "cover" | "highlight" | "reel") {
    setAttachKind(kind);
    setAttachMode("link");
    setTgLink("");
  }

  async function submitAttachLink() {
    setLinking("attach");
    onError(null);
    try {
      const res = await fetch(`/api/content-room/parts/${part.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId: part.id, kind: attachKind, mode: "link", telegramLink: tgLink.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا در لینک");
      onToast("فایل از تلگرام به این قسمت لینک شد.");
      setTimeout(() => onToast(null), 3000);
      setAttachMode("idle");
      setTgLink("");
      await mutateAssets();
      await mutateGroupMedia();
      await onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "خطا در لینک");
    } finally {
      setLinking(null);
    }
  }

  async function armAwaitReply() {
    setLinking("arm");
    onError(null);
    try {
      const res = await fetch(`/api/content-room/parts/${part.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId: part.id, kind: attachKind, mode: "await_reply" }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا در شروع حالت ریپلای");
      onToast(`حالت ریپلای فعال شد — ${Math.round((body.data?.ttlSeconds ?? 300) / 60)} دقیقه فرصت دارید.`);
      setTimeout(() => onToast(null), 4000);
      setAttachMode("reply");
      setAwaitTtl(body.data?.ttlSeconds ?? 300);
    } catch (e) {
      onError(e instanceof Error ? e.message : "خطا");
    } finally {
      setLinking(null);
    }
  }

  async function cancelAwaitReply() {
    try {
      await fetch(`/api/content-room/parts/${part.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId: part.id, kind: attachKind, mode: "cancel" }),
      });
    } catch {}
    setAttachMode("idle");
    onToast("حالت ریپلای لغو شد.");
    setTimeout(() => onToast(null), 2000);
  }

  // TTL countdown tick
  useEffect(() => {
    if (attachMode !== "reply" || awaitTtl <= 0) return;
    const t = setInterval(() => {
      setAwaitTtl((v) => {
        if (v <= 1) {
          clearInterval(t);
          setAttachMode("idle");
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [attachMode, awaitTtl > 0]);

  async function handleLinkGroupMedia(
    item: { messageId: string; fileId: string | null; fileName: string | null },
    kind: "video" | "cover" | "highlight" | "reel",
  ) {
    const key = `${item.messageId}:${kind}`;
    setLinking(key);
    onError(null);
    try {
      const res = await fetch(`/api/content-room/parts/${part.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: item.messageId, fileId: item.fileId ?? undefined, fileName: item.fileName ?? undefined, kind }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !(body as { ok?: boolean }).ok) throw new Error((body as { error?: string }).error ?? `خطا در لینک (${res.status})`);
      const label = kind === "video" ? "ویدیو کامل" : kind === "cover" ? "کاور" : kind === "highlight" ? "برش" : "ریلز";
      onToast(`«${item.fileName ?? "ویدیوی گروه"}» به عنوان ${label} لینک شد.`);
      setTimeout(() => onToast(null), 3000);
      await mutateAssets();
      await onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "خطا در لینک");
    } finally {
      setLinking(null);
    }
  }

  async function upload(type: "video" | "cover" | "highlight" | "reel") {
    const file = type === "video" ? videoFile : type === "cover" ? coverFile : type === "highlight" ? highlightFile : reelFile;
    if (!file) {
      onError("لطفاً ابتدا فایل را انتخاب کنید.");
      return;
    }
    setUploading(type);
    setUploadProgress(0);
    setUploadLoaded(0);
    setUploadTotal(file.size);
    setUploadSpeed(0);
    onError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("type", type);
      if (part.version) form.set("expectedVersion", String(part.version));
      const body = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("POST", `/api/content-room/parts/${part.id}/upload`);
        let lastLoaded = 0;
        let lastTime = Date.now();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
            setUploadLoaded(e.loaded);
            setUploadTotal(e.total);
            const now = Date.now();
            const dt = (now - lastTime) / 1000;
            if (dt > 0.3) {
              const speed = (e.loaded - lastLoaded) / dt;
              setUploadSpeed(speed);
              lastLoaded = e.loaded;
              lastTime = now;
            }
          }
        };
        xhr.onload = () => {
          xhrRef.current = null;
          try {
            const json = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300 && json.ok) resolve(json);
            else reject(new Error(json.error ?? `خطا در آپلود (${xhr.status})`));
          } catch {
            reject(new Error(`خطا در آپلود (${xhr.status})`));
          }
        };
        xhr.onerror = () => {
          xhrRef.current = null;
          reject(new Error("خطا در ارتباط با سرور"));
        };
        xhr.onabort = () => {
          xhrRef.current = null;
          reject(new Error("آپلود لغو شد"));
        };
        xhr.ontimeout = () => {
          xhrRef.current = null;
          reject(new Error("اتمام زمان آپلود"));
        };
        xhr.send(form);
      });
      if (!body.ok) {
        throw new Error(body.error ?? "خطا در آپلود");
      }
      const successMsg =
        type === "video" ? `ویدیو کامل قسمت ${part.partNumber} با موفقیت آپلود شد.` : type === "cover" ? `کاور قسمت ${part.partNumber} با موفقیت آپلود شد.` : type === "highlight" ? `برش قسمت ${part.partNumber} با موفقیت آپلود شد.` : `ریلز قسمت ${part.partNumber} با موفقیت آپلود شد.`;
      onToast(successMsg);
      setTimeout(() => onToast(null), 3000);
      if (type === "video") {
        setVideoFile(null);
        setPreviewUrl(null);
      } else if (type === "cover") {
        setCoverFile(null);
        setCoverPreviewUrl(null);
      } else if (type === "highlight") {
        setHighlightFile(null);
        setHighlightPreviewUrl(null);
      } else {
        setReelFile(null);
        setReelPreviewUrl(null);
      }
      await onRefresh();
      if (type === "highlight" || type === "reel") await mutateAssets();
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطا در آپلود فایل";
      // لغو را به‌عنوان خطا نمایش نده اگر کاربر خودش لغو کرده
      if (message === "آپلود لغو شد") {
        onToast("آپلود لغو شد");
        setTimeout(() => onToast(null), 2000);
      } else {
        onError(message);
        if (message.includes("نسخه قدیمی") || message.includes("409")) {
          await onRefresh();
          if (type === "highlight" || type === "reel") await mutateAssets();
        }
      }
    } finally {
      xhrRef.current = null;
      setUploading(null);
      setUploadProgress(0);
      setUploadLoaded(0);
      setUploadSpeed(0);
    }
  }

  function handleCancel() {
    if (xhrRef.current) {
      xhrRef.current.abort();
    }
  }

  async function handleDeleteAsset(assetId: string) {
    try {
      const res = await fetch(`/api/content-room/parts/${part.id}/assets?assetId=${assetId}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا در حذف");
      await mutateAssets();
      await onRefresh();
      onToast("فایل حذف شد.");
      setTimeout(() => onToast(null), 2000);
    } catch (e) {
      onError(e instanceof Error ? e.message : "خطا در حذف");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-tg-border bg-tg-hover/20 px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-tg-text">قسمت {part.partNumber}</p>
        <div className="flex flex-wrap gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              hasVideo
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-slate-500/10 text-slate-500"
            }`}
          >
            {hasVideo ? "ویدیو کامل ✓" : "بدون ویدیو"}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              hasCover
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                : "bg-slate-500/10 text-slate-500"
            }`}
          >
            {hasCover ? "کاور ✓" : "بدون کاور"}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${hasHighlight ? "bg-amber-500/15 text-amber-700" : "bg-slate-500/10 text-slate-500"}`}>
            {hasHighlight ? "برش ✓" : "بدون برش"}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${hasReel ? "bg-violet-500/15 text-violet-700" : "bg-slate-500/10 text-slate-500"}`}>
            {hasReel ? "ریلز ✓" : "بدون ریلز"}
          </span>
        </div>
      </div>

      {part.playbackUrl && (
        <DedicatedPlayer src={part.playbackUrl} poster={part.coverUrl ?? undefined} title={`قسمت ${part.partNumber} — ویدیو کامل`} className="aspect-video w-full" />
      )}
      {part.coverFileRef && (
        <div className="space-y-1">
          <p className="truncate rounded bg-tg-surface px-2 py-1 font-mono text-[11px] text-tg-secondary" title={part.coverFileRef}>
            کاور: {part.coverFileRef.slice(0, 32)}
            {part.coverFileRef.length > 32 ? "..." : ""}
          </p>
          {(coverPreviewUrl || part.coverUrl) && (
            <img src={coverPreviewUrl || part.coverUrl || undefined} alt={`کاور قسمت ${part.partNumber}`} className="h-24 w-full rounded object-cover" />
          )}
        </div>
      )}

      {previewUrl && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-tg-secondary">پیش‌نمایش ویدئو انتخاب‌شده:</p>
          <DedicatedPlayer src={previewUrl} title={videoFile?.name} className="aspect-video w-full" />
          {videoFile && (
            <p className="text-[11px] text-tg-secondary">
              {(videoFile.size / (1024 * 1024)).toFixed(1)} مگابایت · {videoFile.type || "نامشخص"}
            </p>
          )}
        </div>
      )}
      {coverPreviewUrl && !part.coverFileRef && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-tg-secondary">پیش‌نمایش کاور:</p>
          <img src={coverPreviewUrl} alt={`پیش‌نمایش کاور ${part.partNumber}`} className="h-28 w-full rounded object-cover" />
        </div>
      )}

      <div className="space-y-3 border-t border-tg-border pt-3">
        <UploadZone
          icon={Film}
          title="ویدیو کامل"
          hint="حداکثر ۲ گیگابایت — mp4، mov، avi، webm، mkv"
          accept="video/mp4,video/quicktime,video/x-msvideo,video/avi,video/webm,video/x-matroska,video/*"
          file={videoFile}
          onSelect={(f) => { setVideoFile(f); setPreviewUrl(f ? URL.createObjectURL(f) : null); }}
          onClear={() => { setVideoFile(null); setPreviewUrl(null); }}
          onUpload={() => upload("video")}
          actionLabel={hasVideo ? "جایگزینی ویدیو کامل" : "آپلود ویدیو کامل"}
          accentBg="bg-rose-500/10 text-rose-600"
          accentText="text-rose-600 dark:text-rose-400"
          accentBorder="border-rose-500/20"
          isUploading={uploading === "video"}
          progress={uploadProgress}
          loaded={uploadLoaded}
          total={uploadTotal}
          speed={uploadSpeed}
          onCancel={handleCancel}
        />
        {previewUrl && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-tg-secondary">پیش‌نمایش ویدئوی انتخاب‌شده:</p>
            <DedicatedPlayer src={previewUrl} title={videoFile?.name} className="aspect-video w-full" />
          </div>
        )}

        <UploadZone
          icon={ImageIcon}
          title="کاور"
          hint="حداکثر ۱۰ مگابایت — jpeg، png، webp"
          accept="image/jpeg,image/png,image/jpg,image/webp"
          file={coverFile}
          onSelect={(f) => { setCoverFile(f); setCoverPreviewUrl(f ? URL.createObjectURL(f) : null); }}
          onClear={() => { setCoverFile(null); setCoverPreviewUrl(null); }}
          onUpload={() => upload("cover")}
          actionLabel={hasCover ? "جایگزینی کاور" : "آپلود کاور"}
          accentBg="bg-sky-500/10 text-sky-600"
          accentText="text-sky-600 dark:text-sky-400"
          accentBorder="border-sky-500/20"
          isUploading={uploading === "cover"}
          progress={uploadProgress}
          loaded={uploadLoaded}
          total={uploadTotal}
          speed={uploadSpeed}
          onCancel={handleCancel}
        />
        {coverPreviewUrl && !part.coverFileRef && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-tg-secondary">پیش‌نمایش کاور:</p>
            <img src={coverPreviewUrl} alt={`پیش‌نمایش کاور ${part.partNumber}`} className="h-28 w-full rounded object-cover" />
          </div>
        )}

        <UploadZone
          icon={Scissors}
          title="برش‌ها"
          hint="چند برش کوتاه برای هر قسمت — هر کدام حداکثر ۲ گیگابایت"
          accept="video/mp4,video/quicktime,video/webm,video/*"
          file={highlightFile}
          onSelect={(f) => { setHighlightFile(f); setHighlightPreviewUrl(f ? URL.createObjectURL(f) : null); }}
          onClear={() => { setHighlightFile(null); setHighlightPreviewUrl(null); }}
          onUpload={() => upload("highlight")}
          actionLabel="افزودن برش"
          accentBg="bg-amber-500/10 text-amber-600"
          accentText="text-amber-600 dark:text-amber-400"
          accentBorder="border-amber-500/20"
          isUploading={uploading === "highlight"}
          progress={uploadProgress}
          loaded={uploadLoaded}
          total={uploadTotal}
          speed={uploadSpeed}
          onCancel={handleCancel}
        >
          {highlights.length > 0 && (
            <div className="space-y-1">
              {highlights.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded bg-tg-surface px-2 py-1 text-[11px]">
                  <span className="truncate" title={a.fileName ?? a.fileRef}>{a.fileName ?? a.fileRef.slice(0, 24)}</span>
                  <button onClick={() => handleDeleteAsset(a.id)} className="mr-2 text-rose-600 hover:underline">حذف</button>
                </div>
              ))}
              <p className="text-[11px] text-emerald-600">{highlights.length} برش ثبت شده</p>
            </div>
          )}
        </UploadZone>
        {highlightPreviewUrl && (
          <DedicatedPlayer src={highlightPreviewUrl} title={highlightFile?.name} className="aspect-video w-full" />
        )}

        <UploadZone
          icon={Smartphone}
          title="ریلزها"
          hint="چند ریلز برای هر قسمت — هر کدام حداکثر ۲ گیگابایت"
          accept="video/mp4,video/quicktime,video/webm,video/*"
          file={reelFile}
          onSelect={(f) => { setReelFile(f); setReelPreviewUrl(f ? URL.createObjectURL(f) : null); }}
          onClear={() => { setReelFile(null); setReelPreviewUrl(null); }}
          onUpload={() => upload("reel")}
          actionLabel="افزودن ریلز"
          accentBg="bg-violet-500/10 text-violet-600"
          accentText="text-violet-600 dark:text-violet-400"
          accentBorder="border-violet-500/20"
          isUploading={uploading === "reel"}
          progress={uploadProgress}
          loaded={uploadLoaded}
          total={uploadTotal}
          speed={uploadSpeed}
          onCancel={handleCancel}
        >
          {reels.length > 0 && (
            <div className="space-y-1">
              {reels.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded bg-tg-surface px-2 py-1 text-[11px]">
                  <span className="truncate" title={a.fileName ?? a.fileRef}>{a.fileName ?? a.fileRef.slice(0, 24)}</span>
                  <button onClick={() => handleDeleteAsset(a.id)} className="mr-2 text-rose-600 hover:underline">حذف</button>
                </div>
              ))}
              <p className="text-[11px] text-emerald-600">{reels.length} ریلز ثبت شده</p>
            </div>
          )}
        </UploadZone>
        {reelPreviewUrl && (
          <DedicatedPlayer src={reelPreviewUrl} title={reelFile?.name} className="aspect-video w-full" />
        )}
      </div>

      <div className="rounded-xl border border-tg-border bg-tg-surface/50 p-3">
        <p className="text-xs font-bold text-tg-text">افزودن فایل از تلگرام (بدون آپلود مجدد ۲ گیگ)</p>

        {/* Kind selector */}
        {attachMode === "idle" ? (
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {([
              { kind: "video" as const, label: "ویدیو کامل", cls: "hover:border-rose-500/50 hover:text-rose-600" },
              { kind: "cover" as const, label: "کاور", cls: "hover:border-sky-500/50 hover:text-sky-600" },
              { kind: "highlight" as const, label: "برش", cls: "hover:border-amber-500/50 hover:text-amber-600" },
              { kind: "reel" as const, label: "ریلز", cls: "hover:border-violet-500/50 hover:text-violet-600" },
            ]).map(({ kind, label, cls }) => (
              <button
                key={kind}
                onClick={() => startAttach(kind)}
                className={`min-h-[38px] rounded-lg border border-tg-border bg-tg-hover/40 text-xs font-medium text-tg-text transition-colors ${cls}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {/* Mode: paste link */}
            {attachMode === "link" && (
              <div className="space-y-2 rounded-lg border border-tg-border p-2.5">
                <p className="text-[11px] font-semibold text-tg-text">
                  لینک پیام تلگرام را برای «{attachKind === "video" ? "ویدیو کامل" : attachKind === "cover" ? "کاور" : attachKind === "highlight" ? "برش" : "ریلز"}» وارد کنید:
                </p>
                <Input
                  value={tgLink}
                  onChange={(e) => setTgLink(e.target.value)}
                  placeholder="https://t.me/c/2326782937/2577"
                  dir="ltr"
                  className="h-9 font-mono text-xs"
                />
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={submitAttachLink} disabled={linking === "attach" || !tgLink.trim()} className="min-h-[32px] flex-1 text-xs">
                    {linking === "attach" ? "در حال لینک…" : "لینک کن"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setAttachMode("idle")} className="min-h-[32px] text-xs">انصراف</Button>
                </div>
              </div>
            )}

            {/* Mode: await reply */}
            {attachMode === "reply" && (
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  ⏱ منتظر ریپلای شما — {Math.floor(awaitTtl / 60)}:{String(awaitTtl % 60).padStart(2, "0")} مانده
                </p>
                <p className="text-[11px] leading-relaxed text-tg-secondary">
                  در گروه تلگرام، روی ویدیو <b>ریپلای</b> کنید و بنویسید <code className="rounded bg-tg-hover px-1">لینک</code> — همان ویدیو به‌عنوان «{attachKind === "video" ? "ویدیو کامل" : attachKind === "cover" ? "کاور" : attachKind === "highlight" ? "برش" : "ریلز"}» به قسمت {part.partNumber} لینک می‌شود.
                </p>
                <div className="h-1 w-full overflow-hidden rounded-full bg-tg-hover">
                  <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${(awaitTtl / 300) * 100}%` }} />
                </div>
                <Button size="sm" variant="secondary" onClick={cancelAwaitReply} className="min-h-[30px] text-xs">لغو حالت ریپلای</Button>
              </div>
            )}

            {/* Mode switch row (link ↔ reply) */}
            {attachMode === "link" && (
              <button onClick={armAwaitReply} disabled={linking === "arm"} className="w-full rounded-lg border border-dashed border-tg-border px-2 py-1.5 text-[11px] text-tg-secondary transition-colors hover:border-tg-accent/60 hover:text-tg-accent disabled:opacity-40">
                یا <b>دکمه ریپلای</b> — در گروه ریپلای کنید و «لینک» بنویسید (اعتبار ۵ دقیقه)
              </button>
            )}
          </div>
        )}

        {/* Recent group videos — quick visual reference (unchanged visuals, secondary now) */}
        {groupItems.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] font-medium text-tg-secondary hover:text-tg-text">
              ویدیوهای اخیر گروه ({groupOnlyUnlinked ? groupItems.filter((m) => !m.linked).length : groupItems.length})
            </summary>
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] text-tg-secondary">
                <input type="checkbox" checked={groupOnlyUnlinked} onChange={(e) => setGroupOnlyUnlinked(e.target.checked)} className="h-3 w-3" />
                فقط لینک‌نشده‌ها
              </label>
              {(groupOnlyUnlinked ? groupItems.filter((m) => !m.linked) : groupItems).map((m) => {
                const dur = m.durationSec ? `${Math.floor(m.durationSec / 60)}:${String(m.durationSec % 60).padStart(2, "0")}` : null;
                return (
                  <div key={m.messageId} className={`flex items-center gap-2 rounded-lg border p-1.5 ${m.linked ? "border-emerald-500/25 bg-emerald-500/5" : "border-tg-border bg-tg-surface"}`}>
                    {m.thumbUrl ? (
                      <button type="button" onClick={() => setPreviewItem(previewItem === m.messageId ? null : m.messageId)} className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md border border-tg-border bg-black" title="پیش‌نمایش">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.thumbUrl} alt={m.fileName ?? "ویدیوی گروه"} className="h-full w-full object-cover" />
                        {dur && <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[8px] text-white" dir="ltr">{dur}</span>}
                      </button>
                    ) : (
                      <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-tg-border bg-tg-hover">
                        <Film className="h-4 w-4 text-tg-secondary" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-tg-text" title={m.fileName ?? undefined}>{m.fileName ?? (m.caption ? m.caption.slice(0, 30) : "ویدیوی گروه")}</p>
                      <p className="flex items-center gap-1 text-[10px] text-tg-secondary">
                        {m.topicName && <span className="rounded-full bg-tg-accent/10 px-1 font-medium text-tg-accent">{m.topicName}</span>}
                        {m.linked && <span className="rounded-full bg-emerald-500/15 px-1 font-medium text-emerald-700">✓ لینک شده</span>}
                        {m.telegramLink && <a href={m.telegramLink} target="_blank" rel="noopener noreferrer" className="text-tg-accent hover:underline">↗</a>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button onClick={() => handleLinkGroupMedia(m, attachKind)} disabled={linking === `${m.messageId}:${attachKind}`} className="rounded border border-tg-border px-1.5 py-0.5 text-[10px] text-tg-text hover:bg-tg-accent/10 disabled:opacity-40">
                        لینک به قسمت
                      </button>
                    </div>
                  </div>
                );
              })}
              {previewItem && (() => {
                const item = groupItems.find((m) => m.messageId === previewItem);
                return item?.playUrl ? <DedicatedPlayer src={item.playUrl} title={item.fileName ?? undefined} className="aspect-video w-full" /> : null;
              })()}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
