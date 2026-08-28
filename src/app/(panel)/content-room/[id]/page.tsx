"use client";

import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import { ContentRoomDetail } from "@/components/content-room/ContentRoomDetail";
import type { ContentRoomProductDetail } from "@/components/content-room/types";

type RawDetailResponse =
  | ContentRoomProductDetail
  | { product: ContentRoomProductDetail; parts?: unknown[] }
  | { data?: ContentRoomProductDetail }
  | null;

async function detailFetcher(url: string): Promise<ContentRoomProductDetail | null> {
  const data = await fetchContentRoomApi<RawDetailResponse>(url);
  if (!data) return null;
  if (typeof data === "object" && data !== null && "product" in data) {
    const wrapped = data as { product: ContentRoomProductDetail; parts?: ContentRoomProductDetail["parts"] };
    const prod = wrapped.product;
    if (wrapped.parts && !prod.parts) prod.parts = wrapped.parts as ContentRoomProductDetail["parts"];
    return prod;
  }
  if (typeof data === "object" && data !== null && "data" in data) {
    const inner = (data as { data?: ContentRoomProductDetail }).data;
    if (inner) return inner;
  }
  return data as ContentRoomProductDetail;
}

export default function ContentRoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: product, error, isLoading, mutate } = useSWR<ContentRoomProductDetail | null, Error>(
    id ? `/api/content-room/products/${id}` : null,
    detailFetcher,
  );

  const isNotFound = error instanceof ContentRoomApiError && error.status === 404;
  const isForbidden = error instanceof ContentRoomApiError && (error.status === 403 || error.status === 401);

  if (isLoading) {
    return (
      <div className="space-y-6" dir="rtl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    if (isNotFound) {
      return (
        <div className="space-y-6" dir="rtl">
          <Link href="/content-room" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
            <ArrowRight className="h-4 w-4" />
            بازگشت به اتاق محتوا
          </Link>
          <EmptyState title="محصول یافت نشد" description="شناسه محصول نامعتبر است یا محصول حذف شده است." />
        </div>
      );
    }
    if (isForbidden) {
      return (
        <div className="space-y-6" dir="rtl">
          <Link href="/content-room" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
            <ArrowRight className="h-4 w-4" />
            بازگشت به اتاق محتوا
          </Link>
          <ErrorState message="دسترسی ندارید. برای مشاهده این محصول به مجوز مشاهده اتاق محتوا نیاز است." />
        </div>
      );
    }
    return (
      <div className="space-y-6" dir="rtl">
        <Link href="/content-room" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
          <ArrowRight className="h-4 w-4" />
          بازگشت به اتاق محتوا
        </Link>
        <ErrorState message={error.message ?? "خطا در دریافت جزئیات محصول"} />
        <Button variant="secondary" onClick={() => mutate()} className="min-h-[44px]">
          تلاش دوباره
        </Button>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-6" dir="rtl">
        <Link href="/content-room" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
          <ArrowRight className="h-4 w-4" />
          بازگشت به اتاق محتوا
        </Link>
        <EmptyState title="محصولی یافت نشد" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/content-room" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
          <ArrowRight className="h-4 w-4" />
          بازگشت به اتاق محتوا
        </Link>
        <Link href="/content-room/new">
          <Button className="min-h-[44px]">
            <Plus className="h-4 w-4" />
            ایجاد محصول جدید
          </Button>
        </Link>
      </div>

      <ContentRoomDetail product={product} onRefresh={async () => { await mutate(); }} />
    </div>
  );
}
