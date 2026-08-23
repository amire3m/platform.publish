"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { WorkflowReasonDialog } from "@/components/workflow/WorkflowReasonDialog";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import { contentStatusPresentation, CONTENT_STATUSES, CONTENT_STATUS_ORDER } from "@/lib/content-room/presentation";
import type { ContentStatus } from "@/lib/content-room/presentation";
import type { ContentRoomProductDetail } from "./types";
import { CHANNEL_LABELS, PRODUCT_TYPE_LABELS, getProductProgress } from "./room-model";

function requiresReason(from: string, to: string): boolean {
  const fromIdx = CONTENT_STATUS_ORDER[from as ContentStatus];
  const toIdx = CONTENT_STATUS_ORDER[to as ContentStatus];
  if (fromIdx === undefined || toIdx === undefined) return true;
  if (from === to) return true;
  return !(toIdx === fromIdx + 1);
}

interface Props {
  product: ContentRoomProductDetail;
  onRefresh: () => Promise<void> | void;
}

export function ContentRoomDetail({ product, onRefresh }: Props) {
  const [dialog, setDialog] = useState<{
    open: boolean;
    targetStatus: ContentStatus | null;
    reason: string;
    conflict: string | null;
    loading: boolean;
  }>({ open: false, targetStatus: null, reason: "", conflict: null, loading: false });

  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ programId: string } | null>(null);

  const currentStatus = product.status as ContentStatus;
  const pres = contentStatusPresentation(currentStatus);
  const progress = getProductProgress(product.status);

  const isReadyToSend = product.status === "ready_to_send";

  function openStatusDialog(target: ContentStatus) {
    const needReason = requiresReason(product.status, target);
    // For backward/skip show dialog, for forward sequential also allow direct without dialog? spec says next status buttons with reason dialog for backward/skip
    // For forward sequential no reason needed, we still use direct transition
    if (!needReason) {
      void handleTransition(target, "");
      return;
    }
    setDialog({ open: true, targetStatus: target, reason: "", conflict: null, loading: false });
    setActionError(null);
  }

  async function handleTransition(targetStatus: ContentStatus, reason: string) {
    const needReason = requiresReason(product.status, targetStatus);
    if (needReason && !reason.trim()) return;
    if (dialog.open) setDialog((d) => ({ ...d, loading: true, conflict: null }));
    setActionError(null);
    try {
      await fetchContentRoomApi(`/api/content-room/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus, expectedVersion: product.version, reason: reason || undefined }),
      });
      setToast("وضعیت با موفقیت تغییر کرد.");
      setTimeout(() => setToast(null), 3000);
      setDialog({ open: false, targetStatus: null, reason: "", conflict: null, loading: false });
      await onRefresh();
    } catch (e) {
      const isConflict =
        e instanceof ContentRoomApiError && e.status === 409
          ? true
          : e instanceof Error && (e.message.includes("409") || (e as { status?: number }).status === 409);
      if (isConflict) {
        const msg = "اطلاعات توسط کاربر دیگری تغییر کرده است";
        setDialog((d) => ({ ...d, loading: false, conflict: msg, reason }));
        setActionError("اطلاعات توسط کاربر دیگری تغییر کرده است. تازه‌سازی شد؛ دوباره تلاش کنید.");
        await onRefresh();
        return;
      }
      const message = e instanceof ContentRoomApiError ? e.message : e instanceof Error ? e.message : "خطا در تغییر وضعیت";
      setDialog((d) => ({ ...d, loading: false, reason }));
      setActionError(message);
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
            <h1 className="text-xl font-bold text-tg-text">{product.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-tg-secondary">
              <span className="rounded-full bg-tg-hover px-2.5 py-1">{PRODUCT_TYPE_LABELS[product.productType] ?? product.productType}</span>
              <span className="rounded-full bg-tg-hover px-2.5 py-1">{CHANNEL_LABELS[product.channel] ?? product.channel}</span>
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
          <p className="text-xs font-semibold text-tg-secondary">تغییر وضعیت</p>
          <div className="flex flex-wrap gap-2">
            {CONTENT_STATUSES.map((s) => {
              const isCurrent = s === product.status;
              const label = contentStatusPresentation(s as ContentStatus).label;
              const needReason = requiresReason(product.status, s);
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={isCurrent ? "secondary" : "primary"}
                  disabled={isCurrent}
                  onClick={() => openStatusDialog(s as ContentStatus)}
                  className="min-h-[32px] text-xs"
                  title={needReason ? `${label} (نیاز به دلیل)` : label}
                >
                  {label}
                  {needReason && !isCurrent ? " *" : ""}
                </Button>
              );
            })}
          </div>
          <p className="text-[11px] text-tg-secondary">انتقال به مرحله بعد بدون دلیل، بازگشت یا پرش نیازمند دلیل است.</p>
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
          {!isReadyToSend && <span className="self-center text-xs text-tg-secondary">فقط وقتی وضعیت «آماده ارسال» باشد فعال است.</span>}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-tg-text">قسمت‌ها</h2>
        {product.parts && product.parts.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...product.parts]
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((part) => (
                <div key={part.id} className="rounded-lg border border-tg-border bg-tg-hover/20 px-3 py-2">
                  <p className="text-sm font-medium text-tg-text">قسمت {part.partNumber}</p>
                  <p className="text-xs text-tg-secondary">part_number: {part.partNumber}</p>
                  {part.fileRef && <p className="mt-1 text-xs text-tg-secondary">{part.fileRef}</p>}
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-tg-secondary">قسمتی ثبت نشده است.</p>
        )}
      </Card>

      <WorkflowReasonDialog
        open={dialog.open}
        onClose={() => setDialog((d) => ({ ...d, open: false, loading: false, conflict: null }))}
        onConfirm={(reason) => handleTransition(dialog.targetStatus as ContentStatus, reason)}
        title={dialog.targetStatus ? `تغییر وضعیت به ${contentStatusPresentation(dialog.targetStatus as ContentStatus).label}` : "ثبت دلیل"}
        description={
          dialog.targetStatus && requiresReason(product.status, dialog.targetStatus)
            ? "برای این تغییر وضعیت (بازگشت یا پرش) ارائه دلیل الزامی است. دلیل در تاریخچه ثبت می‌شود."
            : "در صورت نیاز توضیح را وارد کنید."
        }
        requiresReason={dialog.targetStatus ? requiresReason(product.status, dialog.targetStatus as string) : true}
        initialReason={dialog.reason}
        loading={dialog.loading}
        conflictMessage={dialog.conflict}
      />
    </div>
  );
}
