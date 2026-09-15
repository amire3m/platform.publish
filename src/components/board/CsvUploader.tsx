"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { applyMapping, mapHeaders, parseCsv, toCsvRow, validateMapped, type BoardField } from "@/lib/board/csv";
import { Field, BoardSelect } from "@/components/board/ui";

const FIELD_LABELS: Array<{ value: BoardField | ""; label: string }> = [
  { value: "", label: "— نادیده بگیر —" },
  { value: "channel", label: "نام کانال" },
  { value: "date", label: "تاریخ" },
  { value: "videoTitle", label: "عنوان ویدیو" },
  { value: "program", label: "نام برنامه" },
  { value: "contentType", label: "نوع محتوا" },
  { value: "views", label: "تعداد بازدید" },
  { value: "watchMinutes", label: "زمان تماشا (دقیقه)" },
  { value: "avgViewSeconds", label: "میانگین زمان تماشا (ثانیه)" },
  { value: "impressions", label: "تعداد نمایش" },
  { value: "ctr", label: "نرخ کلیک" },
  { value: "likes", label: "تعداد لایک" },
  { value: "comments", label: "تعداد کامنت" },
  { value: "shares", label: "تعداد اشتراک‌گذاری" },
  { value: "subsGained", label: "مشترک جدید" },
  { value: "subsLost", label: "مشترک از دست‌رفته" },
  { value: "subsTotal", label: "مشترکان فعلی" },
  { value: "monetized", label: "وضعیت مانیتایز" },
  { value: "country", label: "کشور مخاطب" },
  { value: "trafficSource", label: "منبع ورودی" },
];

import type { CsvRow } from "@/lib/board/types";

export function CsvUploader({ onConfirm }: { onConfirm: (rows: CsvRow[], fileName: string) => void }) {
  const [fileName, setFileName] = useState("");
  const [header, setHeader] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Array<BoardField | null>>([]);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!header.length) return { accepted: 0, issues: 0 };
    const { rows: mapped } = applyMapping(header, rows.slice(0, 200), mapping);
    return { accepted: mapped.length, issues: validateMapped(mapped).length };
  }, [header, rows, mapping]);

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setError("فایل خالی یا نامعتبر است.");
      return;
    }
    const [h, ...data] = parsed;
    setFileName(file.name);
    setHeader(h);
    setRows(data);
    setMapping(mapHeaders(h));
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-bold text-tg-text">بارگذاری CSV یوتیوب</h3>
        <p className="mt-1 text-xs text-tg-secondary">خروجی YouTube Studio — ستون‌ها خودکار شناسایی می‌شوند؛ موارد نامشخص را دستی تطبیق بدهید.</p>
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => handleFile(e.target.files?.[0])}
        className="text-sm text-tg-text"
        aria-label="انتخاب فایل CSV"
      />
      {error && (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      )}
      {header.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {header.map((h, i) => (
              <Field key={i} label={`ستون: ${h || `(${i + 1})`}`}>
                <BoardSelect
                  value={mapping[i] ?? ""}
                  onChange={(v) => setMapping((m) => m.map((x, j) => (j === i ? ((v as BoardField) || null) : x)))}
                  options={FIELD_LABELS}
                  ariaLabel={`تطبیق ستون ${h}`}
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                const { rows: mapped } = applyMapping(header, rows, mapping);
                onConfirm(mapped.map(toCsvRow), fileName);
              }}
              disabled={!preview.accepted}
              className="min-h-[44px]"
            >
              تأیید و اعمال ({preview.accepted} ردیف)
            </Button>
            {preview.issues > 0 && <span className="text-xs text-amber-700 dark:text-amber-300">{preview.issues} هشدار اعتبارسنجی</span>}
          </div>
        </>
      )}
    </Card>
  );
}
