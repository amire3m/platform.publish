"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button, Card, Input, Select, Label, Textarea, ErrorState } from "@/components/ui";
import { fetchContentRoomApi, ContentRoomApiError } from "@/lib/content-room/client";
import { CHANNELS } from "@/lib/channels";

export default function ContentRoomNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [productType, setProductType] = useState("");
  const [channel, setChannel] = useState("");
  const [partsCount, setPartsCount] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

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
      const data = await fetchContentRoomApi<{ id: string }>(`/api/content-room/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          productType,
          channel,
          partsCount: Number(partsCount),
          notes: notes.trim() || null,
        }),
      });
      const id = (data as unknown as { id?: string })?.id ?? (data as unknown as { product?: { id: string } })?.product?.id;
      if (id) router.push(`/content-room/${id}`);
      else router.push("/content-room");
    } catch (err) {
      const msg = err instanceof ContentRoomApiError ? err.message : err instanceof Error ? err.message : "خطا در ایجاد محصول";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const controlClass = "min-h-[44px]";

  return (
    <div className="space-y-6" dir="rtl">
      <Link href="/content-room" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
        <ArrowRight className="h-4 w-4" />
        بازگشت به اتاق محتوا
      </Link>
      <div>
        <h1 className="text-xl font-bold text-tg-text">ایجاد محصول</h1>
        <p className="text-sm text-tg-secondary">عنوان، نوع محصول، کانال و تعداد قسمت را وارد کنید.</p>
      </div>

      <Card className="space-y-6">
        {error && <ErrorState message={error} />}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex flex-col gap-1">
            <Label>عنوان *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="مثلاً سریال فرات - فصل اول"
              className={`${controlClass} ${touched && titleError ? "border-rose-500" : ""}`}
              aria-invalid={touched && Boolean(titleError) ? true : undefined}
            />
            {touched && titleError && (
              <p className="text-xs text-rose-600" role="alert">
                {titleError}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label>نوع محصول *</Label>
              <Select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className={`${controlClass} ${touched && typeError ? "border-rose-500" : ""}`}
                aria-invalid={touched && Boolean(typeError) ? true : undefined}
              >
                <option value="">انتخاب نوع</option>
                <option value="serial">سریال</option>
                <option value="documentary">مستند</option>
                <option value="tv_program">برنامه تلویزیونی</option>
                <option value="film">فیلم سینمایی</option>
                <option value="short_film">فیلم کوتاه</option>
                <option value="educational">آموزشی</option>
              </Select>
              {touched && typeError && (
                <p className="text-xs text-rose-600" role="alert">
                  {typeError}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label>کانال *</Label>
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className={`${controlClass} ${touched && channelError ? "border-rose-500" : ""}`}
                aria-invalid={touched && Boolean(channelError) ? true : undefined}
              >
                <option value="">انتخاب کانال</option>
                {CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.labelFa}
                  </option>
                ))}
              </Select>
              {touched && channelError && (
                <p className="text-xs text-rose-600" role="alert">
                  {channelError}
                </p>
              )}
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
              aria-invalid={touched && Boolean(partsError) ? true : undefined}
            />
            {touched && partsError && (
              <p className="text-xs text-rose-600" role="alert">
                {partsError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label>یادداشت</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختیاری..." rows={3} className="min-h-[88px]" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="min-h-[44px]">
              {loading ? "در حال ایجاد..." : "ایجاد محصول"}
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
