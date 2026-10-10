"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Send } from "lucide-react";
import useSWR from "swr";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import { fetchWorkflowApi } from "@/lib/workflow/client";
import type { ContentRoomProductDetail } from "./types";
import { progressFromActivities } from "./room-model";
import { PartUploadCard } from "./ContentRoomDetail";

async function detailFetcher(url: string): Promise<ContentRoomProductDetail | null> {
  const data = await fetchContentRoomApi<unknown>(url);
  if (!data) return null;
  if (typeof data === "object" && data !== null && "product" in data) {
    return (data as { product: ContentRoomProductDetail }).product;
  }
  if (typeof data === "object" && data !== null && "data" in data) {
    return ((data as { data?: ContentRoomProductDetail }).data ?? null) as ContentRoomProductDetail | null;
  }
  return data as ContentRoomProductDetail;
}

/** Dedicated workspace for one part: its pipeline steps, files, music and transcript. */
export function PartWorkspace({ productId, partId }: { productId: string; partId: string }) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  const { data: product, error, isLoading, mutate } = useSWR<ContentRoomProductDetail | null>(
    `/api/content-room/products/${productId}`,
    detailFetcher,
  );
  const { data: meData } = useSWR<{ role?: string; jobFunctions?: string[] }>(
    "/api/auth/me",
    fetchWorkflowApi<{ role?: string; jobFunctions?: string[] }>,
  );
  const myJobs: string[] = meData?.jobFunctions ?? [];
  const isStaffAdmin = meData?.role === "owner" || meData?.role === "manager" || myJobs.includes("publisher_admin");

  const parts = useMemo(
    () => (product?.parts ?? []).filter((p) => (p as { isActive?: boolean }).isActive ?? true).sort((a, b) => a.partNumber - b.partNumber),
    [product],
  );
  const idx = parts.findIndex((p) => p.id === partId);
  const part = idx >= 0 ? parts[idx] : null;
  const prev = idx > 0 ? parts[idx - 1] : null;
  const next = idx >= 0 && idx < parts.length - 1 ? parts[idx + 1] : null;

  const percent = useMemo(() => {
    if (!part) return 0;
    return Math.round(progressFromActivities({ parts: [part] } as never) * 100);
  }, [part]);

  async function onRefresh() {
    await mutate();
  }

  async function handleToggle(pId: string, activity: string, isDone: boolean, note?: string | null) {
    setActionError(null);
    if (!product) return;
    try {
      await fetchContentRoomApi(`/api/content-room/parts/${pId}/activities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity, isDone, expectedProductVersion: product.version, note: note ?? null }),
      });
      await mutate();
    } catch (e) {
      setActionError(e instanceof ContentRoomApiError ? e.message : e instanceof Error ? e.message : "خطا در تغییر فعالیت");
    }
  }

  async function handleSendPart() {
    if (!product || !part) return;
    setSending(true);
    setActionError(null);
    try {
      await fetchContentRoomApi<{ programId: string }>(`/api/content-room/products/${product.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: product.version, partIds: [part.id] }),
      });
      showToast(`قسمت ${part.partNumber} به اتاق انتشار ارسال شد.`);
      await mutate();
    } catch (e) {
      setActionError(e instanceof ContentRoomApiError ? e.message : e instanceof Error ? e.message : "خطا در ارسال قسمت");
    } finally {
      setSending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error || !product) {
    return (
      <div className="space-y-4" dir="rtl">
        <ErrorState message={error instanceof Error ? error.message : "محصول یافت نشد"} />
      </div>
    );
  }
  if (!part) {
    return (
      <div className="space-y-4" dir="rtl">
        <Link href={`/content-room/${productId}`} className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
          <ArrowRight className="h-4 w-4" />
          بازگشت به {product.title}
        </Link>
        <EmptyState title="قسمت یافت نشد" description="این قسمت وجود ندارد یا غیرفعال است." />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/content-room/${productId}`} className="inline-flex items-center gap-1.5 text-xs text-tg-secondary hover:text-tg-accent">
            <ArrowRight className="h-3.5 w-3.5" />
            {product.title}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-tg-text">قسمت {part.partNumber}</h1>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-tg-hover">
              <div className="h-full rounded-full bg-tg-accent transition-all" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-xs font-bold text-tg-text">{percent}٪</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {prev ? (
            <Link href={`/content-room/${productId}/parts/${prev.id}`}>
              <Button size="sm" variant="secondary">
                <ChevronRight className="h-3.5 w-3.5" />
                قسمت {prev.partNumber}
              </Button>
            </Link>
          ) : (
            <Button size="sm" variant="secondary" disabled>
              <ChevronRight className="h-3.5 w-3.5" />
              قبلی
            </Button>
          )}
          {next ? (
            <Link href={`/content-room/${productId}/parts/${next.id}`}>
              <Button size="sm" variant="secondary">
                قسمت {next.partNumber}
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </Link>
          ) : (
            <Button size="sm" variant="secondary" disabled>
              بعدی
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" onClick={handleSendPart} disabled={sending} title="انتشار فقط همین قسمت (تیک‌هایش باید کامل باشد)">
            <Send className="h-3.5 w-3.5" />
            {sending ? "…" : "انتشار این قسمت"}
          </Button>
        </div>
      </div>

      {actionError && <ErrorState message={actionError} />}
      {toast && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-300" role="status">
          {toast}
        </div>
      )}

      <PartUploadCard
        part={part as never}
        onRefresh={onRefresh}
        onError={setActionError}
        onToast={(m) => {
          if (m) showToast(m);
        }}
        onToggle={handleToggle}
        myJobs={myJobs}
        isStaffAdmin={isStaffAdmin}
      />
    </div>
  );
}
