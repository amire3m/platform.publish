"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Pencil } from "lucide-react";
import { Button, Card } from "@/components/ui";
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

        <div className="space-y-3 rounded-lg border border-tg-border bg-tg-hover/20 p-3">
          <p className="text-xs font-semibold text-tg-secondary">چک‌لیست فعالیت‌ها (هر قسمت مستقل)</p>
          <PartActivitiesGrid parts={product.parts as never} onToggle={handleToggle} />
        </div>

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

      <EditProductDialog open={editOpen} product={product} onClose={() => setEditOpen(false)} onSuccess={onRefresh} />
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
    playbackUrl?: string | null;
    coverUrl?: string | null;
    version?: number | null;
    status?: string | null;
  };
  onRefresh: () => Promise<void> | void;
  onError: (msg: string | null) => void;
  onToast: (msg: string | null) => void;
}) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<"video" | "cover" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const hasVideo = Boolean(part.fileRef);
  const hasCover = Boolean(part.coverFileRef);

  function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setVideoFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }

  function handleCoverSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setCoverFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setCoverPreviewUrl(url);
    } else {
      setCoverPreviewUrl(null);
    }
  }

  async function upload(type: "video" | "cover") {
    const file = type === "video" ? videoFile : coverFile;
    if (!file) {
      onError("لطفاً ابتدا فایل را انتخاب کنید.");
      return;
    }
    setUploading(type);
    setUploadProgress(0);
    onError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("type", type);
      if (part.version) form.set("expectedVersion", String(part.version));
      const body = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/content-room/parts/${part.id}/upload`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300 && json.ok) resolve(json);
            else reject(new Error(json.error ?? `خطا در آپلود (${xhr.status})`));
          } catch {
            reject(new Error(`خطا در آپلود (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error("خطا در ارتباط با سرور"));
        xhr.ontimeout = () => reject(new Error("اتمام زمان آپلود"));
        xhr.send(form);
      });
      if (!body.ok) {
        throw new Error(body.error ?? "خطا در آپلود");
      }
      onToast(type === "video" ? `ویدئو قسمت ${part.partNumber} با موفقیت آپلود شد.` : `کاور قسمت ${part.partNumber} با موفقیت آپلود شد.`);
      setTimeout(() => onToast(null), 3000);
      if (type === "video") {
        setVideoFile(null);
        setPreviewUrl(null);
        if (videoInputRef.current) videoInputRef.current.value = "";
      } else {
        setCoverFile(null);
        setCoverPreviewUrl(null);
        if (coverInputRef.current) coverInputRef.current.value = "";
      }
      await onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطا در آپلود فایل";
      onError(message);
      if (message.includes("نسخه قدیمی") || message.includes("409")) {
        await onRefresh();
      }
    } finally {
      setUploading(null);
      setUploadProgress(0);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-tg-border bg-tg-hover/20 px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-tg-text">قسمت {part.partNumber}</p>
        <div className="flex gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              hasVideo
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-slate-500/10 text-slate-500"
            }`}
          >
            {hasVideo ? "ویدئو ✓" : "بدون ویدئو"}
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
        </div>
      </div>

      {part.playbackUrl && (
        <div className="overflow-hidden rounded-lg border border-tg-border bg-black">
          <video
            src={part.playbackUrl}
            controls
            preload="metadata"
            playsInline
            poster={part.coverUrl ?? undefined}
            className="aspect-video w-full object-contain"
          >
            مرورگر شما امکان پخش این ویدئو را ندارد.
          </video>
        </div>
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
          <video src={previewUrl} controls className="h-28 w-full rounded bg-black" />
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

      <div className="space-y-2 border-t border-tg-border pt-2">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-tg-secondary">ویدئوی خام (حداکثر ۲ گیگابایت، با فرمت mp4، mov، avi، webm یا mkv)</label>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,video/avi,video/webm,video/x-matroska,video/*"
            onChange={handleVideoSelect}
            className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-tg-accent file:px-3 file:py-1 file:text-xs file:text-tg-accent-fg"
          />
          <Button
            size="sm"
            onClick={() => upload("video")}
            disabled={!videoFile || uploading !== null}
            className="w-full min-h-[36px] text-xs"
          >
            {uploading === "video" ? `در حال آپلود ویدئو... ${uploadProgress}%` : hasVideo ? "جایگزینی ویدئو" : "آپلود ویدئو"}
          </Button>
          {uploading === "video" && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-tg-hover">
              <div className="h-full bg-tg-accent transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-tg-secondary">کاور (حداکثر ۱۰ مگابایت، با فرمت jpeg یا png)</label>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg,image/webp"
            onChange={handleCoverSelect}
            className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-tg-accent file:px-3 file:py-1 file:text-xs file:text-tg-accent-fg"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => upload("cover")}
            disabled={!coverFile || uploading !== null}
            className="w-full min-h-[36px] text-xs"
          >
            {uploading === "cover" ? `در حال آپلود کاور... ${uploadProgress}%` : hasCover ? "جایگزینی کاور" : "آپلود کاور"}
          </Button>
          {uploading === "cover" && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-tg-hover">
              <div className="h-full bg-sky-500 transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
