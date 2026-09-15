"use client";

import { CollectionManager, type CollectionField } from "@/components/board/CollectionManager";
import type { LicenseItem } from "@/lib/board/types";

const FIELDS: CollectionField[] = [
  { key: "title", label: "عنوان اثر *", type: "text", required: true, span: true },
  { key: "channel", label: "کانال مرتبط", type: "select", options: ["زاویه نو", "ضد روایت", "تماشین", "Iranian Frame", "همه"] },
  { key: "owner", label: "مالک اثر / مجوزدهنده", type: "text" },
  { key: "licenseStatus", label: "وضعیت مجوز", type: "select", options: ["در انتظار اقدام", "در حال پیگیری", "صادر شده", "رد شده"] },
  { key: "removalStatus", label: "وضعیت حذف از کانال‌های دیگر", type: "select", options: ["لازم نیست", "در انتظار حذف", "حذف شده"] },
  { key: "fit", label: "تناسب با کانال", type: "text", span: true },
  { key: "allowedDate", label: "تاریخ مجاز انتشار", type: "date" },
  { key: "notes", label: "توضیحات", type: "textarea", span: true },
];

const SEED: LicenseItem[] = [
  {
    id: "demo-l1", title: "مشاور ۱ (فصل اول)", channel: "تماشین",
    owner: "سازمان صداوسیما", licenseStatus: "در حال پیگیری", removalStatus: "در انتظار حذف",
    fit: "اثر نمایشی پروداکشن‌سنگین؛ ستون انتشار تماشین", allowedDate: "", notes: "انتشار منوط به تأیید صداوسیما و حذف از کانال‌های دیگر.",
  },
  {
    id: "demo-l2", title: "مشاور ۲", channel: "تماشین",
    owner: "", licenseStatus: "در انتظار اقدام", removalStatus: "لازم نیست",
    fit: "کاملاً آماده؛ پس از فصل اول مشاور ۱ در اولویت", allowedDate: "", notes: "",
  },
];

export default function BoardLicensesPage() {
  return (
    <CollectionManager<LicenseItem>
      title="مجوزهای حقوقی"
      description="پیگیری مجوزهای لازم برای تولید و انتشار، از جمله مجوز مشاور ۱ (صداوسیما) و وضعیت حذف از کانال‌های دیگر."
      storageKey="board-report:licenses:v1"
      seed={SEED}
      fields={FIELDS}
      columns={[
        { key: "title", label: "اثر", render: (r) => r.title },
        { key: "channel", label: "کانال", render: (r) => r.channel },
        { key: "licenseStatus", label: "مجوز", render: (r) => r.licenseStatus },
        { key: "removalStatus", label: "حذف از دیگران", render: (r) => r.removalStatus },
        { key: "allowedDate", label: "انتشار مجاز", render: (r) => <span dir="ltr" className="tabular-nums">{r.allowedDate || "—"}</span> },
      ]}
      newLabel="+ مجوز"
    />
  );
}
