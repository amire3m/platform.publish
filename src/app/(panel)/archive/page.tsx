"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Archive, RotateCcw } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { fetchContentRoomApi } from "@/lib/content-room/client";
import type { ContentRoomProductSummary } from "@/components/content-room/types";
import { CHANNEL_LABELS, PRODUCT_TYPE_LABELS } from "@/components/content-room/room-model";
import { contentStatusPresentation } from "@/lib/content-room/presentation";

type ProductsData = ContentRoomProductSummary[] | { products: ContentRoomProductSummary[] } | { items: ContentRoomProductSummary[] } | { data: ContentRoomProductSummary[] };

function normalize(data: unknown): ContentRoomProductSummary[] {
  if (Array.isArray(data)) return data as ContentRoomProductSummary[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.products)) return obj.products as ContentRoomProductSummary[];
    if (Array.isArray(obj.items)) return obj.items as ContentRoomProductSummary[];
    if (Array.isArray(obj.data)) return obj.data as ContentRoomProductSummary[];
  }
  return [];
}

async function fetcher(url: string): Promise<ContentRoomProductSummary[]> {
  const data = await fetchContentRoomApi<ProductsData>(url);
  return normalize(data);
}

export default function ArchivePage() {
  const { data, error, isLoading, mutate } = useSWR<ContentRoomProductSummary[], Error>("/api/content-room/products?includeArchived=true", fetcher);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filter only archived in client as server includes all when includeArchived true; we want archived only for this page
  const archived = (data ?? []).filter((p) => !!p.archivedAt);

  async function handleRestore(p: ContentRoomProductSummary) {
    setBusyId(p.id);
    try {
      await fetchContentRoomApi(`/api/content-room/products/${p.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unarchive" }),
      });
      await mutate();
    } catch (e) {
      alert((e as Error).message ?? "خطا");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-tg-secondary" />
          <h1 className="text-xl font-bold text-tg-text">آرشیو</h1>
        </div>
        <Link href="/content-room">
          <Button variant="secondary" className="min-h-[44px]">بازگشت به اتاق محتوا</Button>
        </Link>
      </div>
      <p className="text-sm text-tg-secondary">محصولات آرشیوشده. آرشیو سرد به محصولاتی گفته می‌شود که بیش از ۹۰ روز از آرشیو آن‌ها گذشته است.</p>

      {isLoading && <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>}
      {error && !isLoading && <ErrorState message={(error as Error).message ?? "خطا در دریافت آرشیو"} />}
      {!isLoading && !error && archived.length === 0 && (
        <EmptyState title="آرشیو خالی است" description="هنوز محصولی آرشیو نشده است." />
      )}
      {!isLoading && !error && archived.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-tg-border bg-tg-hover/40 text-xs text-tg-secondary">
                <tr>
                  <th className="px-3 py-3 text-right font-semibold">عنوان</th>
                  <th className="px-3 py-3 text-right">نوع</th>
                  <th className="px-3 py-3 text-right">کانال</th>
                  <th className="px-3 py-3 text-right">وضعیت</th>
                  <th className="px-3 py-3 text-right">آرشیو شده در</th>
                  <th className="px-3 py-3 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((p) => {
                  const pres = contentStatusPresentation(p.status as never);
                  const archivedAt = p.archivedAt ? new Date(p.archivedAt) : null;
                  return (
                    <tr key={p.id} className="border-b border-tg-border hover:bg-tg-hover/40">
                      <td className="px-3 py-3 font-medium text-tg-text">
                        <Link href={`/content-room/${p.id}`} className="text-tg-accent hover:underline">{p.title}</Link>
                        {p.isCold && <span className="mr-2 rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300">سرد</span>}
                      </td>
                      <td className="px-3 py-3 text-tg-text">{PRODUCT_TYPE_LABELS[p.productType] ?? p.productType}</td>
                      <td className="px-3 py-3 text-tg-text">{CHANNEL_LABELS[p.channel] ?? p.channel}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs ${pres.tone === "success" ? "bg-emerald-500/15 text-emerald-700" : "bg-slate-500/10 text-slate-600"}`}>{pres.label}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-tg-secondary">{archivedAt ? archivedAt.toLocaleDateString("fa-IR") : "—"}</td>
                      <td className="px-3 py-3 text-center">
                        <Button variant="secondary" size="sm" disabled={busyId === p.id} onClick={() => handleRestore(p)}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          بازگردانی
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
