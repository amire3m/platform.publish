"use client";

import { useEffect, useState } from "react";
import { Button, Input, Select, Textarea, Label, Modal } from "@/components/ui";
import { ChannelOptions } from "@/components/ChannelOptions";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import type { ContentRoomProductDetail } from "./types";

interface Props {
  open: boolean;
  product: ContentRoomProductDetail;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function EditProductDialog({ open, product, onClose, onSuccess }: Props) {
  const [title, setTitle] = useState(product.title);
  const [productType, setProductType] = useState(product.productType);
  const [channel, setChannel] = useState(product.channel);
  const [partsCount, setPartsCount] = useState(String(product.partsCount));
  const [notes, setNotes] = useState(product.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(product.title);
      setProductType(product.productType);
      setChannel(product.channel);
      setPartsCount(String(product.partsCount));
      setNotes(product.notes ?? "");
      setError(null);
      setTouched(false);
    }
  }, [open, product]);

  const titleError = !title.trim() ? "عنوان الزامی است." : title.trim().length > 200 ? "عنوان باید حداکثر ۲۰۰ کاراکتر باشد." : null;
  const typeError = !productType ? "نوع محصول الزامی است." : null;
  const channelError = !channel ? "کانال الزامی است." : null;
  const partsNum = Number(partsCount);
  const partsError =
    !partsCount || Number.isNaN(partsNum) || !Number.isInteger(partsNum) || partsNum < 1 || partsNum > 50
      ? "تعداد قسمت باید بین ۱ تا ۵۰ باشد."
      : null;
  const hasError = Boolean(titleError || typeError || channelError || partsError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (hasError) return;
    setLoading(true);
    setError(null);
    try {
      await fetchContentRoomApi(`/api/content-room/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          productType,
          channel,
          partsCount: Number(partsCount),
          notes: notes.trim() || null,
          expectedVersion: product.version,
        }),
      });
      await onSuccess();
      onClose();
    } catch (err) {
      const isConflict = err instanceof ContentRoomApiError && err.status === 409;
      if (isConflict) {
        setError("اطلاعات توسط کاربر دیگری تغییر کرده است. لطفاً صفحه را تازه‌سازی کنید.");
      } else {
        const msg = err instanceof ContentRoomApiError ? err.message : err instanceof Error ? err.message : "خطا در ویرایش محصول";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const controlClass = "min-h-[44px]";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ویرایش محصول"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading} className="min-h-[44px]">
            انصراف
          </Button>
          <Button onClick={handleSubmit as never} disabled={loading} className="min-h-[44px]">
            {loading ? "در حال ذخیره..." : "ذخیره تغییرات"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label>عنوان *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
            className={`${controlClass} ${touched && titleError ? "border-rose-500" : ""}`}
            aria-invalid={touched && Boolean(titleError) ? true : undefined}
          />
          {touched && titleError && <p className="text-xs text-rose-600" role="alert">{titleError}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label>نوع محصول *</Label>
            <Select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className={`${controlClass} ${touched && typeError ? "border-rose-500" : ""}`}
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
            {touched && typeError && <p className="text-xs text-rose-600" role="alert">{typeError}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <Label>کانال *</Label>
            <Select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className={`${controlClass} ${touched && channelError ? "border-rose-500" : ""}`}
            >
              <option value="">انتخاب کانال</option>
              <ChannelOptions />
            </Select>
            {touched && channelError && <p className="text-xs text-rose-600" role="alert">{channelError}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label>تعداد قسمت (۱ تا ۵۰) *</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={partsCount}
            onChange={(e) => setPartsCount(e.target.value)}
            onBlur={() => setTouched(true)}
            className={`${controlClass} ${touched && partsError ? "border-rose-500" : ""}`}
          />
          {touched && partsError && <p className="text-xs text-rose-600" role="alert">{partsError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <Label>یادداشت</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختیاری..." rows={3} className="min-h-[88px]" />
        </div>

        {/* hidden submit for enter */}
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Modal>
  );
}
