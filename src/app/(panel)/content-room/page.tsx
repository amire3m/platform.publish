"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import { filterProducts } from "@/components/content-room/room-model";
import type { ContentRoomProductSummary } from "@/components/content-room/types";
import { ContentRoomFilters } from "@/components/content-room/ContentRoomFilters";
import { ContentRoomTable } from "@/components/content-room/ContentRoomTable";
import { ContentRoomCards } from "@/components/content-room/ContentRoomCards";
import type { ContentRoomFilters as FiltersType } from "@/components/content-room/types";

type ProductsData = ContentRoomProductSummary[] | { products: ContentRoomProductSummary[] } | { items: ContentRoomProductSummary[] } | { data: ContentRoomProductSummary[] };

function normalizeProducts(data: unknown): ContentRoomProductSummary[] {
  if (Array.isArray(data)) return data as ContentRoomProductSummary[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.products)) return obj.products as ContentRoomProductSummary[];
    if (Array.isArray(obj.items)) return obj.items as ContentRoomProductSummary[];
    if (Array.isArray(obj.data)) return obj.data as ContentRoomProductSummary[];
  }
  return [];
}

async function contentRoomFetcher(url: string): Promise<ContentRoomProductSummary[]> {
  // Use fetchContentRoomApi (and fetchWorkflowApi both work) to GET /api/content-room/products
  try {
    const data = await fetchContentRoomApi<ProductsData>(url);
    return normalizeProducts(data);
  } catch {
    // fallback try workflow client
    const data = await fetchWorkflowApi<ProductsData>(url);
    return normalizeProducts(data);
  }
}

export default function ContentRoomPage() {
  const [filters, setFilters] = useState<FiltersType>({
    query: "",
    productType: "",
    channel: "",
    status: "",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.query.trim()) params.set("query", filters.query.trim());
    if (filters.productType) params.set("productType", filters.productType);
    if (filters.channel) params.set("channel", filters.channel);
    if (filters.status) params.set("status", filters.status);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters]);

  const url = `/api/content-room/products${queryString}`;

  const { data: rawData, error, isLoading, mutate } = useSWR<ContentRoomProductSummary[], Error>(url, contentRoomFetcher);

  const products = rawData ?? [];

  // Client-side filtering for query fallback (also ensures stable UI even if server ignores filters)
  const filtered = useMemo(() => filterProducts(products, filters), [products, filters]);

  const isNotFound = error instanceof ContentRoomApiError && error.status === 404 || error instanceof WorkflowApiError && error.status === 404;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">اتاق محتوا</h1>
          <p className="text-sm text-tg-secondary">مدیریت محصولات، قسمت‌ها و آماده‌سازی برای ارسال به اتاق انتشار</p>
        </div>
        <Link href="/content-room/new">
          <Button className="min-h-[44px]">
            <Plus className="h-4 w-4" />
            ایجاد محصول
          </Button>
        </Link>
      </div>

      <ContentRoomFilters value={filters} onChange={setFilters} />

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      )}

      {error && !isLoading && (
        <div className="space-y-3">
          <ErrorState
            message={
              isNotFound
                ? "اتاق محتوا هنوز فعال نشده است (GET /api/content-room/products در دسترس نیست)."
                : (error.message ?? "خطا در دریافت محصولات")
            }
          />
          <Button variant="secondary" onClick={() => mutate()} className="min-h-[44px]">
            تلاش دوباره
          </Button>
        </div>
      )}

      {!isLoading && !error && products.length === 0 && (
        <EmptyState
          title="هنوز محصولی ثبت نشده"
          description="اولین محصول خود را بسازید تا اتاق محتوا فعال شود."
          action={
            <Link href="/content-room/new">
              <Button className="min-h-[44px]">ایجاد محصول</Button>
            </Link>
          }
        />
      )}

      {!isLoading && !error && products.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="نتیجه‌ای یافت نشد"
          description="فیلترها را تغییر دهید یا جست‌وجوی دیگری امتحان کنید."
          action={
            <Button
              variant="secondary"
              className="min-h-[44px]"
              onClick={() => setFilters({ query: "", productType: "", channel: "", status: "" })}
            >
              پاک کردن فیلترها
            </Button>
          }
        />
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <>
          <ContentRoomTable products={filtered} />
          <ContentRoomCards products={filtered} />
        </>
      )}
    </div>
  );
}
