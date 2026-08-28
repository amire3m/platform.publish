"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Plus, Archive, Search, SlidersHorizontal, X } from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton, Input, Select } from "@/components/ui";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import { filterProducts } from "@/components/content-room/room-model";
import type { ContentRoomProductSummary } from "@/components/content-room/types";
import { ContentRoomFilters as BasicFilters } from "@/components/content-room/ContentRoomFilters";
import { ContentRoomTable } from "@/components/content-room/ContentRoomTable";
import { ContentRoomCards } from "@/components/content-room/ContentRoomCards";
import type { ContentRoomFilters as FiltersType } from "@/components/content-room/types";
import { ChannelOptions } from "@/components/ChannelOptions";

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
  try {
    const data = await fetchContentRoomApi<ProductsData>(url);
    return normalizeProducts(data);
  } catch {
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
    dateFrom: "",
    dateTo: "",
    includeArchived: false,
    sort: "",
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.query.trim()) params.set("query", filters.query.trim());
    if (filters.productType) params.set("productType", filters.productType);
    if (filters.channel) params.set("channel", filters.channel);
    if (filters.status) params.set("status", filters.status);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.includeArchived) params.set("includeArchived", "true");
    if (filters.sort) params.set("sort", filters.sort);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters]);

  const url = `/api/content-room/products${queryString}`;

  const { data: rawData, error, isLoading, mutate } = useSWR<ContentRoomProductSummary[], Error>(url, contentRoomFetcher);

  const products = rawData ?? [];
  const filtered = useMemo(() => filterProducts(products, filters), [products, filters]);

  const isNotFound = (error instanceof ContentRoomApiError && error.status === 404) || (error instanceof WorkflowApiError && error.status === 404);

  async function handleArchive(product: ContentRoomProductSummary) {
    if (!confirm(`آیا از بایگانی کردن "${product.title}" اطمینان دارید؟`)) return;
    setArchiveBusy(product.id);
    try {
      await fetchContentRoomApi(`/api/content-room/products/${product.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      await mutate();
    } catch (e) {
      alert((e as Error).message ?? "خطا در بایگانی");
    } finally {
      setArchiveBusy(null);
    }
  }

  async function handleUnarchive(product: ContentRoomProductSummary) {
    setArchiveBusy(product.id);
    try {
      await fetchContentRoomApi(`/api/content-room/products/${product.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unarchive" }),
      });
      await mutate();
    } catch (e) {
      alert((e as Error).message ?? "خطا در بازیابی");
    } finally {
      setArchiveBusy(null);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">اتاق محتوا</h1>
          <p className="text-sm text-tg-secondary">مدیریت محصولات، قسمت‌ها و آماده‌سازی برای ارسال به اتاق انتشار</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/archive">
            <Button variant="secondary" className="min-h-[44px]">
              <Archive className="h-4 w-4" />
              آرشیو
            </Button>
          </Link>
          <Link href="/content-room/new">
            <Button className="min-h-[44px]">
              <Plus className="h-4 w-4" />
              ایجاد محصول
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[240px]">
          <BasicFilters value={filters} onChange={setFilters} />
        </div>
        <Button variant="secondary" className="min-h-[44px]" onClick={() => setDrawerOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" />
          جست‌وجوی پیشرفته
        </Button>
      </div>

      {/* Advanced search drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setDrawerOpen(false)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-tg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-tg-text">
                <Search className="h-4 w-4" />
                جست‌وجوی پیشرفته
              </h2>
              <button onClick={() => setDrawerOpen(false)} className="rounded p-1 text-tg-secondary hover:bg-tg-hover" aria-label="بستن">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-tg-secondary">از تاریخ (ایجاد)</label>
                <Input type="date" value={filters.dateFrom ?? ""} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="min-h-[44px]" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-tg-secondary">تا تاریخ</label>
                <Input type="date" value={filters.dateTo ?? ""} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className="min-h-[44px]" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-tg-secondary">نوع محصول</label>
                <Select value={filters.productType} onChange={(e) => setFilters((f) => ({ ...f, productType: e.target.value }))} className="min-h-[44px]">
                  <option value="">همه انواع</option>
                  <option value="serial">سریال</option>
                  <option value="documentary">مستند</option>
                  <option value="tv_program">برنامه تلویزیونی</option>
                  <option value="film">فیلم سینمایی</option>
                  <option value="short_film">فیلم کوتاه</option>
                  <option value="educational">آموزشی</option>
                  <option value="teaser">تیزر</option>
                  <option value="music_video">نماهنگ</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-tg-secondary">کانال</label>
                <Select value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))} className="min-h-[44px]">
                  <option value="">همه کانال‌ها</option>
                  <ChannelOptions />
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-tg-secondary">وضعیت</label>
                <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="min-h-[44px]">
                  <option value="">همه وضعیت‌ها</option>
                  <option value="imported">واردشده</option>
                  <option value="editing_youtube">در تدوین یوتیوب</option>
                  <option value="copyright_fix">رفع کپی‌رایت</option>
                  <option value="highlight_done">هایلایت ساخته شد</option>
                  <option value="reel_done">ریلز ساخته شد</option>
                  <option value="cover_ready">کاور آماده</option>
                  <option value="ready_to_send">آماده ارسال</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-tg-secondary">مرتب‌سازی</label>
                <Select value={filters.sort ?? ""} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))} className="min-h-[44px]">
                  <option value="">جدیدترین</option>
                  <option value="oldest">قدیمی‌ترین</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm text-tg-text">
                <input
                  type="checkbox"
                  checked={!!filters.includeArchived}
                  onChange={(e) => setFilters((f) => ({ ...f, includeArchived: e.target.checked }))}
                  className="h-4 w-4 rounded border-tg-border"
                />
                نمایش آرشیوشده‌ها
              </label>

              <div className="flex gap-2 pt-2">
                <Button className="flex-1 min-h-[44px]" onClick={() => setDrawerOpen(false)}>اعمال</Button>
                <Button variant="secondary" className="flex-1 min-h-[44px]" onClick={() => setFilters({ query: "", productType: "", channel: "", status: "", dateFrom: "", dateTo: "", includeArchived: false, sort: "" })}>پاک کردن</Button>
              </div>

              <div className="rounded-lg bg-tg-hover/40 p-3 text-xs text-tg-secondary">
                جست‌وجوی ترکیبی پیشرفته از طریق جست‌وجوی سراسری سامانه در دسترس است.
              </div>
            </div>
          </div>
        </div>
      )}

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
                ? "اتاق محتوا هنوز فعال نشده است."
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
              onClick={() => setFilters({ query: "", productType: "", channel: "", status: "", dateFrom: "", dateTo: "", includeArchived: false, sort: "" })}
            >
              پاک کردن فیلترها
            </Button>
          }
        />
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <>
          <ContentRoomTable products={filtered} onArchive={handleArchive} onUnarchive={handleUnarchive} />
          <ContentRoomCards products={filtered} onArchive={handleArchive} onUnarchive={handleUnarchive} />
          {archiveBusy && <p className="text-xs text-tg-secondary">در حال انجام عملیات...</p>}
        </>
      )}
    </div>
  );
}
