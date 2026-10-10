"use client";

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Pencil, UploadCloud, Film, Image as ImageIcon, Scissors, Smartphone, Clapperboard, Hash, X, Play } from "lucide-react";
import { Button, Card, ConfirmModal, Input, Select } from "@/components/ui";
import { DedicatedPlayer } from "@/components/media/DedicatedPlayer";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import { fetchWorkflowApi } from "@/lib/workflow/client";
import { contentStatusPresentation } from "@/lib/content-room/presentation";
import type { ContentStatus } from "@/lib/content-room/presentation";
import type { ContentRoomProductDetail } from "./types";
import { channelLabelFa, productTypeLabelFa, getProductProgressFromActivities, getNextActionFromActivities, progressFromActivities } from "./room-model";
import { getChannelAccounts } from "@/lib/channels";
import { PartActivitiesGrid } from "./PartActivitiesGrid";
import { PartMusic } from "./PartMusic";
import { TranscriptPanel } from "./TranscriptPanel";
import { ChannelLinkDialog } from "./ChannelLinkDialog";
import { EditProductDialog } from "./EditProductDialog";


interface Props {
  product: ContentRoomProductDetail;
  onRefresh: () => Promise<void> | void;
}

function DestinationStatus({ label, connected, optional, onConnect }: { label: string; connected: boolean; optional?: boolean; onConnect: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${connected ? "bg-emerald-500" : optional ? "bg-slate-400" : "bg-amber-500"}`} />
      <span className="text-tg-text">{label}</span>
      {connected ? (
        <span className="text-tg-secondary">متصل</span>
      ) : (
        <button type="button" onClick={onConnect} className="text-tg-accent hover:underline">
          اتصال{optional ? " (اختیاری)" : ""}
        </button>
      )}
    </span>
  );
}

export function ContentRoomDetail({ product, onRefresh }: Props) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendPartId, setSendPartId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [sendResult, setSendResult] = useState<{ programId: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"checklist" | "files" | "group">("checklist");
  const [onlyIncompleteParts, setOnlyIncompleteParts] = useState(false);

  const activePartsList = useMemo(
    () => (product?.parts ?? []).filter((p) => (p as { isActive?: boolean }).isActive ?? true).sort((a, b) => a.partNumber - b.partNumber),
    [product],
  );

  function partPercent(p: { activities?: Record<string, boolean> | null }): number {
    return Math.round(progressFromActivities({ parts: [p] } as never) * 100);
  }

  function partFileSummary(p: { fileRef?: string | null; coverFileRef?: string | null; highlightFileRef?: string | null; reelFileRef?: string | null }): string {
    const bits: string[] = [];
    bits.push(p.fileRef ? "ویدیو ✓" : "ویدیو ✗");
    bits.push(p.coverFileRef ? "کاور ✓" : "کاور ✗");
    bits.push(p.highlightFileRef ? "برش ✓" : "برش ✗");
    bits.push(p.reelFileRef ? "ریلز ✓" : "ریلز ✗");
    return bits.join(" · ");
  }

  const currentStatus = product.status as ContentStatus;
  const pres = contentStatusPresentation(currentStatus);
  const progress = getProductProgressFromActivities(product as never);
  const nextAction = getNextActionFromActivities(product as never);

  const isReadyToSend = product.status === "ready_to_send";
  const channelAccounts = getChannelAccounts(product.channel);
  const { data: channelsData, mutate: mutateChannels } = useSWR<{ channels: Array<{ id: string; labelFa: string; youtubeAccountId: string | null; instagramAccountId: string | null; telegramTopicId: string | null; linked?: { youtube: boolean; instagram: boolean; telegram: boolean } }> }>(
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
  const { data: staffNames } = useSWR<{ names: Array<{ id: string; name: string }> }>(
    "/api/users/names",
    fetchWorkflowApi<{ names: Array<{ id: string; name: string }> }>,
  );
  const { data: meData } = useSWR<{ role?: string; jobFunctions?: string[] }>(
    "/api/auth/me",
    fetchWorkflowApi<{ role?: string; jobFunctions?: string[] }>,
  );
  const myJobs: string[] = meData?.jobFunctions ?? [];
  const isStaffAdmin = meData?.role === "owner" || meData?.role === "manager" || myJobs.includes("publisher_admin");
  const userNames = useMemo(
    () => Object.fromEntries((staffNames?.names ?? []).map((u) => [u.id, u.name])),
    [staffNames],
  );
  const liveChannel = channelsData?.channels?.find((c) => c.id === product.channel);
  const ytId = liveChannel?.youtubeAccountId ?? channelAccounts.youtubeAccountId;
  const igId = liveChannel?.instagramAccountId ?? channelAccounts.instagramAccountId;
  const tgId = liveChannel?.telegramTopicId ?? channelAccounts.telegramTopicId;

  async function handleToggle(partId: string, activity: string, isDone: boolean, note?: string | null) {
    setActionError(null);
    try {
      await fetchContentRoomApi(`/api/content-room/parts/${partId}/activities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity, isDone, expectedProductVersion: product.version, note: note ?? null }),
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
        setActionError(e instanceof Error ? e.message : e instanceof Error ? e.message : "خطا در ارسال به انتشار");
      }
    } finally {
      setSendLoading(false);
    }
  }

  /** Permanently delete the product with all parts (blocked server-side if sent). */
  async function handleDelete() {
    setDeleteLoading(true);
    setActionError(null);
    try {
      await fetchContentRoomApi(`/api/content-room/products/${product.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: product.version }),
      });
      setDeleteOpen(false);
      router.push("/content-room");
    } catch (e) {
      const isConflict = e instanceof ContentRoomApiError && e.status === 409;
      if (isConflict) {
        setActionError("اطلاعات توسط کاربر دیگری تغییر کرده است. لطفاً صفحه را تازه‌سازی کنید.");
        await onRefresh();
      } else {
        setActionError(e instanceof ContentRoomApiError ? e.message : e instanceof Error ? e.message : "خطا در حذف محصول");
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  /** Publish a single part right now (selective send) — requires that part's checklist to be complete. */
  async function handleSendPart(partId: string, partNumber: number) {
    setSendPartId(partId);
    setActionError(null);
    try {
      const data = await fetchContentRoomApi<{ programId: string }>(
        `/api/content-room/products/${product.id}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: product.version, partIds: [partId] }),
        },
      );
      setSendResult({ programId: data.programId });
      setToast(`قسمت ${partNumber} به اتاق انتشار ارسال شد.`);
      setTimeout(() => setToast(null), 4000);
      await onRefresh();
    } catch (e) {
      const isConflict = e instanceof ContentRoomApiError && e.status === 409;
      if (isConflict) {
        setActionError("اطلاعات توسط کاربر دیگری تغییر کرده است");
        await onRefresh();
      } else {
        setActionError(e instanceof Error ? e.message : "خطا در ارسال قسمت");
      }
    } finally {
      setSendPartId(null);
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <span className="font-semibold text-tg-secondary">حساب‌های مقصد</span>
                <DestinationStatus label="یوتیوب" connected={!!ytId} onConnect={() => setLinkOpen(true)} />
                <DestinationStatus label="اینستاگرام" connected={!!igId} onConnect={() => setLinkOpen(true)} />
                <DestinationStatus label="تلگرام" connected={!!tgId} optional onConnect={() => setLinkOpen(true)} />
              </div>
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
          <Link href={`/content-room/${product.id}/send`}>
            <Button className="min-h-[44px]" title="ارسال به انتشار — تنظیم عنوان، مقصد و زمان‌بندی مثل آپلود یوتیوب">
              ارسال به انتشار
            </Button>
          </Link>
          {!isReadyToSend && <span className="self-center text-xs text-amber-600">در صفحه ارسال، عنوان/توضیح هر ویدیو، صفحه یوتیوب/اینستاگرام و زمان‌بندی را تنظیم می‌کنید.</span>}
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
          <PartActivitiesGrid parts={product.parts as never} onToggle={handleToggle} onSendPart={handleSendPart} userNames={userNames} />
        </Card>
      )}

      {activeTab === "files" && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-tg-text">قسمت‌ها ({activePartsList.length}) — برای کار روی یک قسمت وارد صفحه‌اش شوید</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-tg-secondary">
                <input type="checkbox" checked={onlyIncompleteParts} onChange={(e) => setOnlyIncompleteParts(e.target.checked)} className="h-3.5 w-3.5" />
                فقط ناقص‌ها
              </label>
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) router.push(`/content-room/${product.id}/parts/${e.target.value}`);
                }}
                className="min-h-[36px] text-xs"
                aria-label="پرش به قسمت"
              >
                <option value="">پرش به قسمت…</option>
                {activePartsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    قسمت {p.partNumber} — {partPercent(p)}٪
                  </option>
                ))}
              </Select>
            </div>
          </div>
        {activePartsList.length > 0 ? (
          <ul className="divide-y divide-tg-border overflow-hidden rounded-xl border border-tg-border">
            {activePartsList
              .filter((p) => !onlyIncompleteParts || partPercent(p) < 100)
              .map((p) => {
                const pct = partPercent(p);
                const done = pct >= 100;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/content-room/${product.id}/parts/${p.id}`}
                      className="flex items-center gap-3 p-3 transition-colors hover:bg-tg-hover/40"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${done ? "bg-emerald-500 text-white" : "bg-tg-accent-soft text-tg-accent"}`}>
                        {done ? "✓" : p.partNumber.toLocaleString("fa-IR")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-tg-text">قسمت {p.partNumber}</p>
                          <span className="shrink-0 text-xs font-bold text-tg-text">{pct}٪</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-tg-hover">
                          <div className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-tg-accent"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 truncate text-[11px] text-tg-secondary">{partFileSummary(p)}</p>
                      </div>
                      <span className="shrink-0 text-tg-secondary">‹</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        ) : (
          <p className="text-sm text-tg-secondary">قسمتی ثبت نشده است.</p>
        )}
        {product.parts && product.parts.some((p) => (p as { isActive?: boolean }).isActive === false) && (
          <p className="text-xs text-tg-secondary">قسمت‌های پنهان (کاهش تعداد قسمت) فایل‌ها و تیک‌های قبلی را حفظ کرده‌اند؛ با افزایش تعداد قسمت دوباره فعال می‌شوند.</p>
        )}
      </Card>
      )}

      <Card className="space-y-3 border-rose-500/25">
        <div>
          <h2 className="text-sm font-bold text-tg-text">حذف دائمی محصول</h2>
          <p className="mt-1 text-xs leading-5 text-tg-secondary">
            محصول با همه قسمت‌ها، فایل‌ها و تیک‌ها برای همیشه پاک می‌شود و قابل بازیابی نیست.
          </p>
        </div>
        {product.sentProgram ? (
          <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
            این محصول به اتاق انتشار ارسال شده و قابل حذف نیست؛ از بایگانی استفاده کنید.
          </p>
        ) : (
          <div>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)} className="min-h-[40px]">
              حذف دائمی
            </Button>
          </div>
        )}
      </Card>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="حذف دائمی محصول؟"
        description={`«${product.title}» با همه قسمت‌ها برای همیشه پاک می‌شود. این عمل قابل بازگشت نیست.`}
        danger
        loading={deleteLoading}
        confirmLabel="حذف برای همیشه"
      />

      <EditProductDialog open={editOpen} product={product} onClose={() => setEditOpen(false)} onSuccess={onRefresh} />
      <ChannelLinkDialog
        open={linkOpen}
        channelId={product.channel}
        channelLabel={channelLabelFa(product.channel)}
        current={{ youtubeAccountId: ytId ?? null, instagramAccountId: igId ?? null, telegramTopicId: tgId ?? null }}
        onClose={() => setLinkOpen(false)}
        onSaved={() => mutateChannels()}
      />
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

interface ConflictSession {
  partId: string;
  partNumber: number;
  kind: string;
  ttlSeconds: number;
}

/** Pipeline steps in order: activity key, fa label, owning jobs, telegram kind. */
const PIPELINE_STEPS = [
  { activity: "raw_telegram", label: "خام (هندبریک)", jobs: ["full_editor"], tgKind: "video" },
  { activity: "copyright_report", label: "گزارش کپی‌رایت", jobs: ["full_editor"], tgKind: "report" },
  { activity: "music_replaced", label: "موسیقی", jobs: ["full_editor"], tgKind: null },
  { activity: "final_full", label: "نسخه نهایی", jobs: ["full_editor"], tgKind: "final" },
  { activity: "highlight_done", label: "برش", jobs: ["reel_editor"], tgKind: "highlight" },
  { activity: "reel_done", label: "ریلز", jobs: ["reel_editor"], tgKind: "reel" },
  { activity: "cover_ready", label: "کاور", jobs: ["graphic"], tgKind: "cover" },
] as const;

type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** Step panel wrapper: tick checkbox + label + collapsible body. */
function StepPanel({
  step,
  index,
  done,
  open,
  onOpen,
  onToggleTick,
  telegram,
  children,
}: {
  step: PipelineStep;
  index: number;
  done: boolean;
  open: boolean;
  onOpen: () => void;
  onToggleTick: (activity: string, isDone: boolean) => void;
  telegram?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-xl border ${open ? "border-tg-accent/50" : "border-tg-border"}`}>
      <div className="flex items-center gap-2 p-2.5">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onToggleTick(step.activity, e.target.checked)}
          title={done ? "برداشتن تیک (درج گزارش تفصیلی از تب چک‌لیست)" : "ثبت انجام این قدم"}
          aria-label={`${step.label} — انجام شد`}
          className="h-4 w-4 shrink-0 rounded border-tg-border text-tg-accent focus:ring-tg-accent"
        />
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-right" aria-expanded={open}>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? "bg-emerald-500 text-white" : "bg-tg-hover text-tg-secondary"}`}>
            {done ? "✓" : (index + 1).toLocaleString("fa-IR")}
          </span>
          <span className={`truncate text-xs font-bold ${open ? "text-tg-accent" : "text-tg-text"}`}>{step.label}</span>
          {done && <span className="shrink-0 text-[10px] text-emerald-600">انجام شد</span>}
        </button>
      </div>
      {open && <div className="space-y-3 border-t border-tg-border p-3">{children}{telegram}</div>}
    </section>
  );
}

export function PartUploadCard({
  part,
  onRefresh,
  onError,
  onToast,
  onToggle,
  myJobs,
  isStaffAdmin,
}: {
  part: {
    id: string;
    partNumber: number;
    fileRef?: string | null;
    coverFileRef?: string | null;
    highlightFileRef?: string | null;
    reelFileRef?: string | null;
    playbackUrl?: string | null;
    mirrorUrl?: string | null;
    coverUrl?: string | null;
    highlightUrl?: string | null;
    reelUrl?: string | null;
    ytCheckUrl?: string | null;
    version?: number | null;
    status?: string | null;
    activities?: Record<string, boolean>;
  };
  onRefresh: () => Promise<void> | void;
  onError: (msg: string | null) => void;
  onToast: (msg: string | null) => void;
  onToggle: (partId: string, activity: string, isDone: boolean) => void;
  myJobs: string[];
  isStaffAdmin: boolean;
}) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [highlightFile, setHighlightFile] = useState<File | null>(null);
  const [reelFile, setReelFile] = useState<File | null>(null);
  const [cleanFile, setCleanFile] = useState<File | null>(null);
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<"video" | "cover" | "highlight" | "reel" | "clean" | "final" | "report" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadLoaded, setUploadLoaded] = useState<number>(0);
  const [uploadTotal, setUploadTotal] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [highlightPreviewUrl, setHighlightPreviewUrl] = useState<string | null>(null);
  const [reelPreviewUrl, setReelPreviewUrl] = useState<string | null>(null);
  const [cleanPreviewUrl, setCleanPreviewUrl] = useState<string | null>(null);
  const [finalPreviewUrl, setFinalPreviewUrl] = useState<string | null>(null);
  const [reportPreviewUrl, setReportPreviewUrl] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [playKey, setPlayKey] = useState(0);

  async function handlePrepareVideo() {
    if (!part.fileRef) return;
    setPreparing(true);
    setPrepareError(null);
    try {
      const res = await fetch("/api/media/warm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: part.fileRef }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "آماده‌سازی ناموفق بود.");
      setPlayFailed(false);
      setPlayKey((k) => k + 1);
      onToast("ویدیو آماده شد.");
      await onRefresh();
    } catch (e) {
      setPrepareError(e instanceof Error ? e.message : "آماده‌سازی ناموفق بود.");
    } finally {
      setPreparing(false);
    }
  }

  const hasVideo = Boolean(part.fileRef);
  const hasCover = Boolean(part.coverFileRef);
  const { data: assetsData, mutate: mutateAssets } = useSWR<{ ok: boolean; data: { assets: Array<{ id: string; kind: string; fileRef: string; fileName: string | null; targetKind?: string | null; targetAssetId?: string | null; createdAt: string }>; bundles?: Array<{ bundleId: string; kind: string; parts: number }> } }>(
    `/api/content-room/parts/${part.id}/assets`,
    async (url: string) => {
      const res = await fetch(url);
      const json = await res.json();
      return json;
    },
  );
  const highlights = assetsData?.data?.assets?.filter((a) => a.kind === "highlight") ?? [];
  const reels = assetsData?.data?.assets?.filter((a) => a.kind === "reel") ?? [];
  const cleans = assetsData?.data?.assets?.filter((a) => a.kind === "clean") ?? [];
  const finals = assetsData?.data?.assets?.filter((a) => a.kind === "final") ?? [];
  const reports = assetsData?.data?.assets?.filter((a) => a.kind === "report") ?? [];
  const hasFinal = finals.length > 0;
  const hasReport = reports.length > 0;
  const bundles = assetsData?.data?.bundles ?? [];
  const bundleOf = (kind: string): { bundleId: string; kind: string; parts: number } | undefined =>
    bundles.find((b) => b.kind === kind);
  const bundleBadge = (kind: string): ReactNode => {
    const b = bundleOf(kind);
    if (!b) return null;
    return <p className="text-[11px] text-emerald-600">فایل چندپارچه ✓ ({b.parts} پارت، سرهم‌بندی خودکار)</p>;
  };

  const coverAssets = assetsData?.data?.assets?.filter((a) => a.kind === "cover") ?? [];
  const [coverTarget, setCoverTarget] = useState<"" | "youtube_full" | "highlight" | "reel">("");
  const [coverAsset, setCoverAsset] = useState("");
  const coverTargetLabel = (t: string | null | undefined): string =>
    t === "youtube_full" ? "ویدیوی کامل" : t === "highlight" ? "برش" : t === "reel" ? "ریلز" : "بدون هدف مشخص";
  const mediaKindLabel = (k: string): string =>
    k === "video" ? "ویدیو کامل" : k === "cover" ? "کاور" : k === "highlight" ? "برش" : k === "reel" ? "ریلز" : k === "final" ? "نسخه نهایی" : k === "report" ? "اسکرین‌شات گزارش" : "نسخه کلین";
  // keep legacy single-ref badge for migrated rows that haven't been moved
  const hasHighlight = highlights.length > 0 || Boolean(part.highlightFileRef);
  const hasReel = reels.length > 0 || Boolean(part.reelFileRef);
  const hasClean = cleans.length > 0;

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
  const [attachKind, setAttachKind] = useState<"video" | "cover" | "highlight" | "reel" | "clean" | "final" | "report">("video");
  const [tgLink, setTgLink] = useState("");
  const [awaitTtl, setAwaitTtl] = useState(0);
  const [conflict, setConflict] = useState<{ partId: string; partNumber: number; kind: string; ttlSeconds: number } | null>(null);

  function startAttach(kind: "video" | "cover" | "highlight" | "reel" | "clean" | "final" | "report") {
    if (attachMode === "reply") {
      void cancelAwaitReply({ silent: true });
    }
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
        body: JSON.stringify({
          partId: part.id,
          kind: attachKind,
          mode: "link",
          telegramLink: tgLink.trim(),
          targetKind: attachKind === "cover" && coverTarget ? coverTarget : undefined,
          targetAssetId: attachKind === "cover" && coverAsset ? coverAsset : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "خطا در لینک");
      if (body.data?.resolved === false) {
        onError("لینک ثبت شد ولی فایل مستقیم از تلگرام خوانده نشد؛ از «دکمه ریپلای» یا انتخاب از ویدیوهای گروه استفاده کنید.");
      } else {
        onToast("فایل از تلگرام به این قسمت لینک شد.");
        setTimeout(() => onToast(null), 3000);
      }
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
      if (!res.ok || !body.ok) {
        if (body?.code === "SESSION_CONFLICT" && body?.data?.session) {
          setConflict(body.data.session as ConflictSession);
          return;
        }
        throw new Error(body.error ?? "خطا در شروع حالت ریپلای");
      }
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

  async function cancelAwaitReply(opts?: { silent?: boolean; partId?: string; kind?: string }) {
    const targetPartId = opts?.partId ?? part.id;
    const targetKind = opts?.kind ?? attachKind;
    try {
      const res = await fetch(`/api/content-room/parts/${part.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId: targetPartId, kind: targetKind, mode: "cancel" }),
      });
      const body = await res.json().catch(() => null);
      if (body?.code === "SESSION_CONFLICT" && body?.data?.session) {
        // server holds a different session — drop local armed state
        setAttachMode("idle");
        if (!opts?.silent) onError("نشست دیگری فعال است؛ حالت محلی بازنشانی شد.");
        return false;
      }
    } catch {}
    setAttachMode("idle");
    if (!opts?.silent) {
      onToast("حالت ریپلای لغو شد.");
      setTimeout(() => onToast(null), 2000);
    }
    return true;
  }

  async function confirmConflictTakeover() {
    if (!conflict) return;
    setConflict(null);
    const ok = await cancelAwaitReply({ silent: true, partId: conflict.partId, kind: conflict.kind });
    if (!ok) return;
    await armAwaitReply();
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
    kind: "video" | "cover" | "highlight" | "reel" | "clean" | "final" | "report",
  ) {
    const key = `${item.messageId}:${kind}`;
    setLinking(key);
    onError(null);
    try {
      const res = await fetch(`/api/content-room/parts/${part.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: item.messageId,
          fileId: item.fileId ?? undefined,
          fileName: item.fileName ?? undefined,
          kind,
          targetKind: kind === "cover" && coverTarget ? coverTarget : undefined,
          targetAssetId: kind === "cover" && coverAsset ? coverAsset : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !(body as { ok?: boolean }).ok) throw new Error((body as { error?: string }).error ?? `خطا در لینک (${res.status})`);
      const label = mediaKindLabel(kind);
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

  async function upload(type: "video" | "cover" | "highlight" | "reel" | "clean" | "final" | "report") {
    const file = type === "video" ? videoFile : type === "cover" ? coverFile : type === "highlight" ? highlightFile : type === "reel" ? reelFile : type === "final" ? finalFile : type === "report" ? reportFile : cleanFile;
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
      // Raw octet-stream body + metadata in query: the server streams straight
      // to disk and then to Telegram — RAM stays flat even for 2GB files.
      const qs = new URLSearchParams({ type, filename: file.name, mime: file.type || "" });
      if (type === "cover" && coverTarget) qs.set("targetKind", coverTarget);
      if (type === "cover" && coverAsset) qs.set("targetAssetId", coverAsset);
      if (part.version) qs.set("expectedVersion", String(part.version));
      const body = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("POST", `/api/content-room/parts/${part.id}/upload?${qs.toString()}`);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
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
        xhr.send(file);
      });
      if (!body.ok) {
        throw new Error(body.error ?? "خطا در آپلود");
      }
      const successMsg =
        type === "video" ? `ویدیو کامل قسمت ${part.partNumber} با موفقیت آپلود شد.` : type === "cover" ? `کاور قسمت ${part.partNumber} با موفقیت آپلود شد.` : type === "highlight" ? `برش قسمت ${part.partNumber} با موفقیت آپلود شد.` : type === "reel" ? `ریلز قسمت ${part.partNumber} با موفقیت آپلود شد.` : type === "final" ? `نسخه نهایی قسمت ${part.partNumber} با موفقیت آپلود شد.` : type === "report" ? `اسکرین‌شات گزارش قسمت ${part.partNumber} با موفقیت آپلود شد.` : `نسخه کلین قسمت ${part.partNumber} با موفقیت آپلود شد.`;
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
      } else if (type === "reel") {
        setReelFile(null);
        setReelPreviewUrl(null);
      } else if (type === "final") {
        setFinalFile(null);
        setFinalPreviewUrl(null);
      } else if (type === "report") {
        setReportFile(null);
        setReportPreviewUrl(null);
      } else {
        setCleanFile(null);
        setCleanPreviewUrl(null);
      }
      await onRefresh();
      if (type === "highlight" || type === "reel" || type === "clean" || type === "final" || type === "report") await mutateAssets();
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
          if (type === "highlight" || type === "reel" || type === "clean" || type === "final" || type === "report") await mutateAssets();
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

  const acts = (part as { activities?: Record<string, boolean> }).activities ?? {};
  const stepDone = (a: string): boolean => Boolean(acts[a]);
  const stepBy = (a: string): PipelineStep =>
    (PIPELINE_STEPS.find((s) => s.activity === a) ?? { activity: a, label: a, jobs: [], tgKind: null }) as PipelineStep;
  const canSeeStep = (s: PipelineStep): boolean => {
    if (showAllSteps || isStaffAdmin) return true;
    if (myJobs.length === 0) return true;
    return s.jobs.some((j) => myJobs.includes(j));
  };
  const visibleSteps = PIPELINE_STEPS.filter(canSeeStep);
  const firstOpen = visibleSteps.find((s) => !stepDone(s.activity))?.activity ?? visibleSteps[0]?.activity ?? null;
  const activeStep = openStep && visibleSteps.some((s) => s.activity === openStep) ? openStep : firstOpen;

  function openStepAndKind(activity: string) {
    setOpenStep(activity);
    const st = PIPELINE_STEPS.find((s) => s.activity === activity);
    if (st?.tgKind) {
      setAttachKind(st.tgKind as "video" | "cover" | "highlight" | "reel" | "clean" | "final" | "report");
      setAttachMode("idle");
      setTgLink("");
    }
  }

  const wantImage = attachKind === "cover" || attachKind === "report";
  const telegramVisibleItems = (groupOnlyUnlinked ? groupItems.filter((m) => !m.linked) : groupItems).filter((m) => {
    if (!m.mime) return true;
    const isImg = m.mime.startsWith("image/");
    return wantImage ? isImg : !isImg;
  });

  const telegramBlock = (
    <div className="space-y-2 rounded-xl border border-dashed border-tg-border bg-tg-surface/40 p-3">
      <p className="text-xs font-bold text-tg-text">
        افزودن از تلگرام — {mediaKindLabel(attachKind)} <span className="font-normal text-tg-secondary">(بدون آپلود مجدد)</span>
      </p>
      {attachMode === "idle" ? (
        <button
          type="button"
          onClick={() => startAttach(attachKind)}
          className="w-full rounded-lg border border-tg-border bg-tg-hover/40 px-2 py-2 text-xs font-medium text-tg-text transition-colors hover:border-tg-accent/60 hover:text-tg-accent"
        >
          لینک پیام تلگرام یا ریپلای در گروه
        </button>
      ) : (
        <div className="space-y-2">
          {attachMode === "link" && (
            <div className="space-y-2 rounded-lg border border-tg-border p-2.5">
              <Input
                value={tgLink}
                onChange={(e) => setTgLink(e.target.value)}
                placeholder="https://t.me/c/2326782937/2577"
                dir="ltr"
                className="h-9 font-mono text-xs"
              />
              {attachKind === "cover" && (
                <Select value={coverTarget} onChange={(e) => setCoverTarget(e.target.value as "" | "youtube_full" | "highlight" | "reel")} className="text-xs" aria-label="هدف کاور">
                  <option value="">کاور اصلی قسمت</option>
                  <option value="youtube_full">کاور ویدیوی کامل</option>
                  <option value="highlight">کاور برش</option>
                  <option value="reel">کاور ریلز</option>
                </Select>
              )}
              <div className="flex gap-1.5">
                <Button size="sm" onClick={submitAttachLink} disabled={linking === "attach" || !tgLink.trim()} className="min-h-[32px] flex-1 text-xs">
                  {linking === "attach" ? "در حال لینک…" : "لینک کن"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAttachMode("idle")} className="min-h-[32px] text-xs">انصراف</Button>
              </div>
              <button onClick={armAwaitReply} disabled={linking === "arm"} className="w-full rounded-lg border border-dashed border-tg-border px-2 py-1.5 text-[11px] text-tg-secondary transition-colors hover:border-tg-accent/60 hover:text-tg-accent disabled:opacity-40">
                یا <b>دکمه ریپلای</b> — در گروه ریپلای کنید و «لینک» بنویسید (اعتبار ۵ دقیقه)
              </button>
            </div>
          )}
          {attachMode === "reply" && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                ⏱ منتظر ریپلای شما — {Math.floor(awaitTtl / 60)}:{String(awaitTtl % 60).padStart(2, "0")} مانده
              </p>
              <p className="text-[11px] leading-relaxed text-tg-secondary">
                در گروه تلگرام، روی {wantImage ? "عکس" : "ویدیو"} <b>ریپلای</b> کنید و بنویسید <code className="rounded bg-tg-hover px-1">لینک</code> — همان فایل به‌عنوان «{mediaKindLabel(attachKind)}» به قسمت {part.partNumber} لینک می‌شود.
              </p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-tg-hover">
                <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${(awaitTtl / 300) * 100}%` }} />
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => cancelAwaitReply()} className="min-h-[30px] flex-1 text-xs">لغو حالت ریپلای</Button>
                <Button size="sm" variant="secondary" onClick={() => setAttachMode("idle")} className="min-h-[30px] text-xs">انصراف</Button>
              </div>
            </div>
          )}
          <ConfirmModal
            open={conflict !== null}
            onClose={() => setConflict(null)}
            onConfirm={confirmConflictTakeover}
            title="لینک فعال دیگری در جریان است"
            description={
              conflict
                ? `قسمت ${conflict.partNumber} (${conflict.kind}) هم‌اکنون در حالت ریپلای است — حدود ${Math.max(1, Math.round(conflict.ttlSeconds / 60))} دقیقه مانده. با ادامه، آن لغو و این قسمت مسلح می‌شود.`
                : ""
            }
            confirmLabel="لغو قبلی و ادامه"
          />
        </div>
      )}
      {groupItems.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] font-medium text-tg-secondary hover:text-tg-text">
            انتخاب از ویدیوهای گروه ({telegramVisibleItems.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] text-tg-secondary">
              <input type="checkbox" checked={groupOnlyUnlinked} onChange={(e) => setGroupOnlyUnlinked(e.target.checked)} className="h-3 w-3" />
              فقط لینک‌نشده‌ها
            </label>
            {telegramVisibleItems.map((m) => {
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
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-tg-border bg-tg-hover/20 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-tg-text">قسمت {part.partNumber}</p>
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              hasVideo
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-slate-500/10 text-slate-500"
            }`}
          >
            {hasVideo ? "ویدیو کامل ✓" : "بدون ویدیو"}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${hasFinal ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-slate-500/10 text-slate-500"}`}>
            {hasFinal ? "نهایی ✓" : "بدون نهایی"}
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
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${hasReport ? "bg-orange-500/15 text-orange-700" : "bg-slate-500/10 text-slate-500"}`}>
            {hasReport ? "گزارش ✓" : "بدون گزارش"}
          </span>
          {typeof part.fileRef === "string" && part.fileRef.startsWith("bundle:") && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              ویدیو چندپارچه ✓
            </span>
          )}
          {typeof part.coverFileRef === "string" && part.coverFileRef.startsWith("bundle:") && (
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
              کاور چندپارچه ✓
            </span>
          )}
          {(isStaffAdmin || myJobs.length > 0) && (
            <button
              type="button"
              onClick={() => setShowAllSteps((v) => !v)}
              className="rounded-full border border-tg-border px-2 py-0.5 text-[10px] text-tg-secondary hover:text-tg-text"
              title="نمایش قدم‌های همه سمت‌ها یا فقط سمت من"
            >
              {showAllSteps || isStaffAdmin ? "همه" : "فقط سمت من"}
            </button>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="قدم‌های تولید">
        {visibleSteps.map((s, i) => {
          const done = stepDone(s.activity);
          const active = activeStep === s.activity;
          return (
            <button
              key={s.activity}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => openStepAndKind(s.activity)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active ? "border-tg-accent bg-tg-accent-soft text-tg-accent" : "border-tg-border text-tg-secondary hover:text-tg-text"
              }`}
              title={done ? `${s.label} — انجام شده` : `${s.label} — قدم ${i + 1}`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${done ? "bg-emerald-500 text-white" : "bg-tg-hover text-tg-secondary"}`}>
                {done ? "✓" : (i + 1).toLocaleString("fa-IR")}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {part.playbackUrl && (
        <DedicatedPlayer
          key={playKey}
          src={part.mirrorUrl ?? part.playbackUrl}
          fallbackSrc={part.mirrorUrl ? part.playbackUrl : undefined}
          poster={part.coverUrl ?? undefined}
          title={`قسمت ${part.partNumber} — ویدیو کامل`}
          className="aspect-video w-full"
          onError={() => setPlayFailed(true)}
        />
      )}
      {playFailed && (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-tg-border bg-black p-3 text-center">
          <p className="text-[11px] text-white">پخش مستقیم برای این فایل ممکن نشد.</p>
          {prepareError && (
            <p className="text-[11px] text-rose-300" role="alert">
              {prepareError}
            </p>
          )}
          {part.fileRef && !part.fileRef.startsWith("tg_msg_") && (
            <Button size="sm" onClick={handlePrepareVideo} disabled={preparing} className="min-h-[32px] text-xs">
              {preparing ? "در حال آماده‌سازی..." : "آماده‌سازی ویدیو"}
            </Button>
          )}
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
        {visibleSteps.some((s) => s.activity === "raw_telegram") && (
        <StepPanel step={stepBy("raw_telegram")} index={visibleSteps.findIndex((s) => s.activity === "raw_telegram")} done={stepDone("raw_telegram")} open={activeStep === "raw_telegram"} onOpen={() => openStepAndKind("raw_telegram")} onToggleTick={(a, v) => onToggle(part.id, a, v)} telegram={telegramBlock}>
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
        </StepPanel>
        )}

        {visibleSteps.some((s) => s.activity === "copyright_report") && (
        <StepPanel step={stepBy("copyright_report")} index={visibleSteps.findIndex((s) => s.activity === "copyright_report")} done={stepDone("copyright_report")} open={activeStep === "copyright_report"} onOpen={() => openStepAndKind("copyright_report")} onToggleTick={(a, v) => onToggle(part.id, a, v)} telegram={telegramBlock}>
          <p className="text-[11px] leading-5 text-tg-secondary">
            اسکرین‌شات صفحه کپی‌رایت یوتیوب را اینجا آپلود کن — مستقیم در تاپیک «بررسی کپی‌رایت» تلگرام ذخیره می‌شود.
          </p>
          <UploadZone
            icon={ImageIcon}
            title="اسکرین‌شات گزارش کپی‌رایت"
            hint="jpeg، png — ذخیره در تاپیک بررسی کپی‌رایت"
            accept="image/jpeg,image/png,image/jpg,image/webp"
            file={reportFile}
            onSelect={(f) => { setReportFile(f); setReportPreviewUrl(f ? URL.createObjectURL(f) : null); }}
            onClear={() => { setReportFile(null); setReportPreviewUrl(null); }}
            onUpload={() => upload("report")}
            actionLabel="آپلود اسکرین‌شات"
            accentBg="bg-orange-500/10 text-orange-600"
            accentText="text-orange-600 dark:text-orange-400"
            accentBorder="border-orange-500/20"
            isUploading={uploading === "report"}
            progress={uploadProgress}
            loaded={uploadLoaded}
            total={uploadTotal}
            speed={uploadSpeed}
            onCancel={handleCancel}
          />
          {reportPreviewUrl && (
            <img src={reportPreviewUrl} alt="پیش‌نمایش اسکرین‌شات" className="h-28 w-full rounded object-cover" />
          )}
          {reports.length > 0 && (
            <div className="space-y-1">
              {reports.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded bg-tg-surface px-2 py-1 text-[11px]">
                  <span className="truncate" title={a.fileName ?? a.fileRef}>{a.fileName ?? a.fileRef.slice(0, 24)}</span>
                  <button onClick={() => handleDeleteAsset(a.id)} className="mr-2 text-rose-600 hover:underline">حذف</button>
                </div>
              ))}
              <p className="text-[11px] text-emerald-600">{reports.length} اسکرین‌شات ثبت شده</p>
            </div>
          )}
          {bundleBadge("report")}
        </StepPanel>
        )}

        {visibleSteps.some((s) => s.activity === "music_replaced") && (
        <StepPanel step={stepBy("music_replaced")} index={visibleSteps.findIndex((s) => s.activity === "music_replaced")} done={stepDone("music_replaced")} open={activeStep === "music_replaced"} onOpen={() => openStepAndKind("music_replaced")} onToggleTick={(a, v) => onToggle(part.id, a, v)}>
          <PartMusic partId={part.id} partNumber={part.partNumber} />
        </StepPanel>
        )}

        {visibleSteps.some((s) => s.activity === "final_full") && (
        <StepPanel step={stepBy("final_full")} index={visibleSteps.findIndex((s) => s.activity === "final_full")} done={stepDone("final_full")} open={activeStep === "final_full"} onOpen={() => openStepAndKind("final_full")} onToggleTick={(a, v) => onToggle(part.id, a, v)} telegram={telegramBlock}>
          <p className="text-[11px] leading-5 text-tg-secondary">
            نسخه تمیز و نهایی (بدون کپی‌رایت + لوگو/اینترو/آترو کانال). فایل خام دست‌نخورده می‌ماند؛ ارسال یوتیوب از همین نسخه می‌خواند.
          </p>
          <UploadZone
            icon={Clapperboard}
            title="نسخه نهایی"
            hint="تک‌فایل هر قسمت (جایگزین نسخه قبلی) — حداکثر ۲ گیگابایت"
            accept="video/mp4,video/quicktime,video/webm,video/*"
            file={finalFile}
            onSelect={(f) => { setFinalFile(f); setFinalPreviewUrl(f ? URL.createObjectURL(f) : null); }}
            onClear={() => { setFinalFile(null); setFinalPreviewUrl(null); }}
            onUpload={() => upload("final")}
            actionLabel={hasFinal ? "جایگزینی نسخه نهایی" : "آپلود نسخه نهایی"}
            accentBg="bg-emerald-500/10 text-emerald-600"
            accentText="text-emerald-600 dark:text-emerald-400"
            accentBorder="border-emerald-500/20"
            isUploading={uploading === "final"}
            progress={uploadProgress}
            loaded={uploadLoaded}
            total={uploadTotal}
            speed={uploadSpeed}
            onCancel={handleCancel}
          >
            {finals.length > 0 && (
              <div className="space-y-1">
                {finals.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded bg-tg-surface px-2 py-1 text-[11px]">
                    <span className="truncate" title={a.fileName ?? a.fileRef}>{a.fileName ?? a.fileRef.slice(0, 24)}</span>
                    <button onClick={() => handleDeleteAsset(a.id)} className="mr-2 text-rose-600 hover:underline">حذف</button>
                  </div>
                ))}
              </div>
            )}
            {bundleBadge("final")}
          </UploadZone>
          {finalPreviewUrl && (
            <DedicatedPlayer src={finalPreviewUrl} title={finalFile?.name} className="aspect-video w-full" />
          )}
          <details>
            <summary className="cursor-pointer text-[11px] font-medium text-tg-secondary hover:text-tg-text">
              نسخه کلین {cleans.length > 0 ? `(${cleans.length} ثبت شده)` : ""} — نسخه تمیز هر قسمت
            </summary>
            <div className="mt-2 space-y-2">
              <UploadZone
                icon={Clapperboard}
                title="نسخه کلین"
                hint="هر کدام حداکثر ۲ گیگابایت"
                accept="video/mp4,video/quicktime,video/webm,video/*"
                file={cleanFile}
                onSelect={(f) => { setCleanFile(f); setCleanPreviewUrl(f ? URL.createObjectURL(f) : null); }}
                onClear={() => { setCleanFile(null); setCleanPreviewUrl(null); }}
                onUpload={() => upload("clean")}
                actionLabel="افزودن نسخه کلین"
                accentBg="bg-teal-500/10 text-teal-600"
                accentText="text-teal-600 dark:text-teal-400"
                accentBorder="border-teal-500/20"
                isUploading={uploading === "clean"}
                progress={uploadProgress}
                loaded={uploadLoaded}
                total={uploadTotal}
                speed={uploadSpeed}
                onCancel={handleCancel}
              >
                {cleans.length > 0 && (
                  <div className="space-y-1">
                    {cleans.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded bg-tg-surface px-2 py-1 text-[11px]">
                        <span className="truncate" title={a.fileName ?? a.fileRef}>{a.fileName ?? a.fileRef.slice(0, 24)}</span>
                        <button onClick={() => handleDeleteAsset(a.id)} className="mr-2 text-rose-600 hover:underline">حذف</button>
                      </div>
                    ))}
                    <p className="text-[11px] text-emerald-600">{cleans.length} نسخه کلین ثبت شده</p>
                  </div>
                )}
              </UploadZone>
              {cleanPreviewUrl && (
                <DedicatedPlayer src={cleanPreviewUrl} title={cleanFile?.name} className="aspect-video w-full" />
              )}
            </div>
          </details>
        </StepPanel>
        )}

        {visibleSteps.some((s) => s.activity === "cover_ready") && (
        <StepPanel step={stepBy("cover_ready")} index={visibleSteps.findIndex((s) => s.activity === "cover_ready")} done={stepDone("cover_ready")} open={activeStep === "cover_ready"} onOpen={() => openStepAndKind("cover_ready")} onToggleTick={(a, v) => onToggle(part.id, a, v)} telegram={telegramBlock}>
        <UploadZone
          icon={ImageIcon}
          title="کاور"
          hint="حداکثر ۱۰ مگابایت — jpeg، png، webp"
          accept="image/jpeg,image/png,image/jpg,image/webp"
          file={coverFile}
          onSelect={(f) => { setCoverFile(f); setCoverPreviewUrl(f ? URL.createObjectURL(f) : null); }}
          onClear={() => { setCoverFile(null); setCoverPreviewUrl(null); }}
          onUpload={() => upload("cover")}
          actionLabel={coverTarget ? `آپلود کاور ${coverTargetLabel(coverTarget)}` : hasCover ? "جایگزینی کاور اصلی" : "آپلود کاور اصلی"}
          accentBg="bg-sky-500/10 text-sky-600"
          accentText="text-sky-600 dark:text-sky-400"
          accentBorder="border-sky-500/20"
          isUploading={uploading === "cover"}
          progress={uploadProgress}
          loaded={uploadLoaded}
          total={uploadTotal}
          speed={uploadSpeed}
          onCancel={handleCancel}
        >
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-tg-secondary">این کاور برای کدام خروجی است؟</p>
            <Select
              value={coverTarget}
              onChange={(e) => {
                setCoverTarget(e.target.value as "" | "youtube_full" | "highlight" | "reel");
                setCoverAsset("");
              }}
              className="text-xs"
              aria-label="هدف کاور"
            >
              <option value="">کاور اصلی قسمت (پیش‌فرض همه خروجی‌ها)</option>
              <option value="youtube_full">کاور ویدیوی کامل</option>
              <option value="highlight">کاور برش</option>
              <option value="reel">کاور ریلز</option>
            </Select>
            {(coverTarget === "highlight" || coverTarget === "reel") && (
              <Select value={coverAsset} onChange={(e) => setCoverAsset(e.target.value)} className="text-xs" aria-label="برش یا ریلز مشخص">
                <option value="">همه {coverTarget === "highlight" ? "برش‌ها" : "ریلزها"} (بدون سنجاق به یکی مشخص)</option>
                {(coverTarget === "highlight" ? highlights : reels).map((a) => (
                  <option key={a.id} value={a.id}>
                    سنجاق به: {a.fileName ?? a.fileRef.slice(0, 24)}
                  </option>
                ))}
              </Select>
            )}
          </div>
          {coverAssets.length > 0 && (
            <div className="space-y-1">
              {coverAssets.map((a) => {
                const pinned = a.targetAssetId ? [...highlights, ...reels].find((x) => x.id === a.targetAssetId) : null;
                return (
                  <div key={a.id} className="flex items-center justify-between rounded bg-tg-surface px-2 py-1 text-[11px]">
                    <span className="truncate" title={a.fileName ?? a.fileRef}>
                      {coverTargetLabel(a.targetKind)} — {a.fileName ?? a.fileRef.slice(0, 24)}
                      {pinned && <span className="text-tg-accent"> (سنجاق: {pinned.fileName ?? pinned.fileRef.slice(0, 18)})</span>}
                    </span>
                    <button onClick={() => handleDeleteAsset(a.id)} className="mr-2 text-rose-600 hover:underline">حذف</button>
                  </div>
                );
              })}
              <p className="text-[11px] text-emerald-600">{coverAssets.length} کاور مخصوص ثبت شده</p>
            </div>
          )}
          {bundleBadge("cover")}
        </UploadZone>
        {coverPreviewUrl && !part.coverFileRef && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-tg-secondary">پیش‌نمایش کاور:</p>
            <img src={coverPreviewUrl} alt={`پیش‌نمایش کاور ${part.partNumber}`} className="h-28 w-full rounded object-cover" />
          </div>
        )}
        </StepPanel>
        )}

        {visibleSteps.some((s) => s.activity === "highlight_done") && (
        <StepPanel step={stepBy("highlight_done")} index={visibleSteps.findIndex((s) => s.activity === "highlight_done")} done={stepDone("highlight_done")} open={activeStep === "highlight_done"} onOpen={() => openStepAndKind("highlight_done")} onToggleTick={(a, v) => onToggle(part.id, a, v)} telegram={telegramBlock}>
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
          {bundleBadge("highlight")}
        </UploadZone>
        {highlightPreviewUrl && (
          <DedicatedPlayer src={highlightPreviewUrl} title={highlightFile?.name} className="aspect-video w-full" />
        )}
        </StepPanel>
        )}

        {visibleSteps.some((s) => s.activity === "reel_done") && (
        <StepPanel step={stepBy("reel_done")} index={visibleSteps.findIndex((s) => s.activity === "reel_done")} done={stepDone("reel_done")} open={activeStep === "reel_done"} onOpen={() => openStepAndKind("reel_done")} onToggleTick={(a, v) => onToggle(part.id, a, v)} telegram={telegramBlock}>
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
          {bundleBadge("reel")}
        </UploadZone>
        {reelPreviewUrl && (
          <DedicatedPlayer src={reelPreviewUrl} title={reelFile?.name} className="aspect-video w-full" />
        )}
        </StepPanel>
        )}
      </div>


        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-tg-secondary hover:text-tg-text">
            رونوشت / زیرنویس
          </summary>
          <div className="mt-2">
            <TranscriptPanel partId={part.id} hasFile={hasVideo} onToast={onToast} />
          </div>
        </details>
    </div>
  );
}
