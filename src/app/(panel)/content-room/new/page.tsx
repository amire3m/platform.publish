"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Select, Label, Textarea, ErrorState } from "@/components/ui";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import { ChannelOptions } from "@/components/ChannelOptions";

type Row = {
  title: string;
  productType: string;
  channel: string;
  partsCount: string;
  notes: string;
};

function emptyRow(): Row {
  return { title: "", productType: "", channel: "", partsCount: "1", notes: "" };
}

function rowErrors(row: Row) {
  const titleError = !row.title.trim() ? "عنوان الزامی است." : row.title.trim().length > 200 ? "عنوان باید حداکثر ۲۰۰ کاراکتر باشد." : null;
  const typeError = !row.productType ? "نوع محصول الزامی است." : null;
  const channelError = !row.channel ? "کانال الزامی است." : null;
  const partsNum = Number(row.partsCount);
  const partsError =
    !row.partsCount || Number.isNaN(partsNum) || !Number.isInteger(partsNum) || partsNum < 1 || partsNum > 50
      ? "تعداد قسمت باید بین ۱ تا ۵۰ باشد."
      : null;
  return { titleError, typeError, channelError, partsError };
}

export default function ContentRoomNewPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [rowIndexError, setRowIndexError] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const controlClass = "min-h-[44px]";

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (rows.length >= 10) return;
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(idx: number) {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    const hasAnyError = rows.some((r) => {
      const er = rowErrors(r);
      return Boolean(er.titleError || er.typeError || er.channelError || er.partsError);
    });
    if (hasAnyError) return;

    setLoading(true);
    setError(null);
    setRowIndexError(null);
    try {
      const payload = {
        products: rows.map((r) => ({
          title: r.title.trim(),
          productType: r.productType,
          channel: r.channel,
          partsCount: Number(r.partsCount),
          notes: r.notes.trim() || null,
        })),
      };
      const data = await fetchContentRoomApi<{ products: Array<{ id: string }>; id?: string }>(`/api/content-room/products/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // response shape: { products: [...] } inside data wrapper? fetchContentRoomApi unwraps body.data
      // So data may be { products: [...] } or direct array. Handle both.
      const raw = data as unknown as Record<string, unknown>;
      let firstId: string | null = null;
      if (Array.isArray((raw as { products?: unknown }).products)) {
        const arr = (raw as { products: Array<{ id: string }> }).products;
        firstId = arr[0]?.id ?? null;
      } else if (Array.isArray(raw)) {
        firstId = (raw as Array<{ id: string }>)[0]?.id ?? null;
      } else if (typeof raw.id === "string") {
        firstId = raw.id as string;
      } else if ((raw as { product?: { id: string } }).product?.id) {
        firstId = (raw as { product: { id: string } }).product.id;
      }
      // Fallback: if API returned batch directly as array under data key handled, try raw
      if (firstId) router.push(`/content-room/${firstId}`);
      else router.push("/content-room");
    } catch (err) {
      const rowIdx = (err as { rowIndex?: number }).rowIndex ?? (err as unknown as { rowIndex?: number })?.rowIndex;
      // ContentRoomApiError may carry rowIndex in code? Check error payload
      // fetchContentRoomApi throws with message but not rowIndex; we parse from thrown error's extra?
      // The batch route returns { rowIndex } in json body on 400; our client throws with message only.
      // We attempt to extract from error if present.
      const maybeRowIndex =
        typeof (err as Record<string, unknown>).rowIndex === "number"
          ? ((err as Record<string, unknown>).rowIndex as number)
          : typeof rowIdx === "number"
            ? rowIdx
            : null;
      if (typeof maybeRowIndex === "number") setRowIndexError(maybeRowIndex);
      const msg = err instanceof ContentRoomApiError ? err.message : err instanceof Error ? err.message : "خطا در ایجاد محصول";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <Link href="/content-room" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
        <ArrowRight className="h-4 w-4" />
        بازگشت به اتاق محتوا
      </Link>
      <div>
        <h1 className="text-xl font-bold text-tg-text">ایجاد محصول</h1>
        <p className="text-sm text-tg-secondary">عنوان، نوع محصول، کانال و تعداد قسمت را وارد کنید. می‌توانید تا ۱۰ محصول را هم‌زمان ایجاد کنید.</p>
      </div>

      <Card className="space-y-6">
        {error && <ErrorState message={error} />}
        {rowIndexError !== null && <p className="text-xs text-rose-600" role="alert">خطا در ردیف {rowIndexError + 1}</p>}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {rows.map((row, idx) => {
            const er = rowErrors(row);
            const showError = touched;
            return (
              <div key={idx} className="rounded-xl border border-tg-border bg-tg-hover/10 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-tg-text">محصول {idx + 1}</p>
                  {rows.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(idx)} className="text-rose-600 hover:text-rose-700" aria-label={`حذف محصول ${idx + 1}`}>
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </Button>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <Label>عنوان *</Label>
                  <Input
                    value={row.title}
                    onChange={(e) => updateRow(idx, { title: e.target.value })}
                    onBlur={() => setTouched(true)}
                    placeholder="مثلاً سریال فرات - فصل اول"
                    className={`${controlClass} ${showError && er.titleError ? "border-rose-500" : ""} ${rowIndexError === idx ? "border-rose-500" : ""}`}
                    aria-invalid={showError && Boolean(er.titleError) ? true : undefined}
                  />
                  {showError && er.titleError && <p className="text-xs text-rose-600" role="alert">{er.titleError}</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label>نوع محصول *</Label>
                    <Select
                      value={row.productType}
                      onChange={(e) => updateRow(idx, { productType: e.target.value })}
                      className={`${controlClass} ${showError && er.typeError ? "border-rose-500" : ""}`}
                      aria-invalid={showError && Boolean(er.typeError) ? true : undefined}
                    >
                      <option value="">انتخاب نوع</option>
                      <option value="serial">سریال</option>
                      <option value="documentary">مستند</option>
                      <option value="tv_program">برنامه تلویزیونی</option>
                      <option value="film">فیلم سینمایی</option>
                      <option value="short_film">فیلم کوتاه</option>
                      <option value="educational">آموزشی</option>
                      <option value="teaser">تیزر</option>
                      <option value="music_video">نماهنگ</option>
                    </Select>
                    {showError && er.typeError && <p className="text-xs text-rose-600" role="alert">{er.typeError}</p>}
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label>کانال *</Label>
                    <Select
                      value={row.channel}
                      onChange={(e) => updateRow(idx, { channel: e.target.value })}
                      className={`${controlClass} ${showError && er.channelError ? "border-rose-500" : ""}`}
                      aria-invalid={showError && Boolean(er.channelError) ? true : undefined}
                    >
                      <option value="">انتخاب کانال</option>
                      <ChannelOptions />
                    </Select>
                    {showError && er.channelError && <p className="text-xs text-rose-600" role="alert">{er.channelError}</p>}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Label>تعداد قسمت (۱ تا ۵۰) *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={row.partsCount}
                    onChange={(e) => updateRow(idx, { partsCount: e.target.value })}
                    onBlur={() => setTouched(true)}
                    className={`${controlClass} ${showError && er.partsError ? "border-rose-500" : ""}`}
                    aria-invalid={showError && Boolean(er.partsError) ? true : undefined}
                  />
                  {showError && er.partsError && <p className="text-xs text-rose-600" role="alert">{er.partsError}</p>}
                </div>

                <div className="flex flex-col gap-1">
                  <Label>یادداشت</Label>
                  <Textarea value={row.notes} onChange={(e) => updateRow(idx, { notes: e.target.value })} placeholder="اختیاری..." rows={2} className="min-h-[72px]" />
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={addRow} disabled={rows.length >= 10} className="min-h-[44px]">
              <Plus className="h-4 w-4" />
              افزودن محصول دیگر
            </Button>
            {rows.length >= 10 && <span className="self-center text-xs text-tg-secondary">حداکثر ۱۰ محصول</span>}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="min-h-[44px]">
              {loading ? "در حال ایجاد..." : rows.length > 1 ? `ایجاد ${rows.length} محصول` : "ایجاد محصول"}
            </Button>
            <Link href="/content-room">
              <Button type="button" variant="secondary" className="min-h-[44px]">
                انصراف
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
