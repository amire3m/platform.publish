import { UNKNOWN_LABEL_FA } from "@/lib/presentation-fa";

interface ImportResultInput {
  batchId?: unknown;
  counts?: Record<string, unknown>;
  results?: Array<Record<string, unknown>>;
}

const COUNT_LABELS = {
  total: "کل ردیف‌ها",
  created: "ایجادشده",
  updated: "به‌روزرسانی‌شده",
  skipped: "ردشده",
  failed: "ناموفق",
} as const;

const STATUS_LABELS: Record<string, string> = {
  created: "ایجاد شد",
  updated: "به‌روزرسانی شد",
  skipped: "رد شد",
  failed: "ناموفق",
};

const REASON_LABELS: Record<string, string> = {
  "row not found": "ردیف در پیش‌نمایش یافت نشد.",
  "ردیف در پیش‌نمایش یافت نشد.": "ردیف در پیش‌نمایش یافت نشد.",
};

export function presentImportResult(input: ImportResultInput | null | undefined) {
  const counts = Object.entries(COUNT_LABELS).map(([key, label]) => ({
    label,
    value: typeof input?.counts?.[key] === "number" ? input.counts[key] as number : 0,
  }));
  const rows = (Array.isArray(input?.results) ? input.results : []).map((result) => {
    const rowIndex = typeof result.rowIndex === "number" ? result.rowIndex : 0;
    const status = typeof result.status === "string" ? STATUS_LABELS[result.status] ?? UNKNOWN_LABEL_FA : UNKNOWN_LABEL_FA;
    let detail = "جزئیات بیشتری ثبت نشده است.";
    if (typeof result.programId === "string") detail = `شناسه برنامه: ${result.programId}`;
    else if (typeof result.reason === "string" && REASON_LABELS[result.reason]) detail = REASON_LABELS[result.reason];
    return { row: rowIndex + 1, status, detail };
  });

  return {
    batchId: typeof input?.batchId === "string" ? input.batchId : undefined,
    counts,
    rows,
  };
}
