"use client";

import { CollectionManager, type CollectionField } from "@/components/board/CollectionManager";
import type { CollabItem } from "@/lib/board/types";

const FIELDS: CollectionField[] = [
  { key: "topic", label: "موضوع مشترک *", type: "text", required: true, span: true },
  { key: "channels", label: "کانال‌های درگیر (با ویرگول)", type: "text", span: true },
  { key: "format", label: "قالب محتوا", type: "text" },
  { key: "status", label: "وضعیت همکاری", type: "select", options: ["ایده", "در حال مذاکره", "فعال", "پایان‌یافته"] },
  { key: "owner", label: "مسئول اجرا", type: "text" },
  { key: "date", label: "تاریخ اجرا", type: "date" },
  { key: "impact", label: "میزان اثرگذاری", type: "textarea", span: true },
];

const SEED: CollabItem[] = [
  {
    id: "demo-c1", channels: ["زاویه نو", "ضد روایت"], topic: "موضوعات اجتماعی", format: "گفت‌وگوی مشترک + برش مستند",
    status: "ایده", owner: "", date: "", impact: "",
  },
  {
    id: "demo-c2", channels: ["زاویه نو", "تماشین"], topic: "گفت‌وگو با عوامل تولید", format: "مصاحبه ویدیویی",
    status: "ایده", owner: "", date: "", impact: "",
  },
  {
    id: "demo-c3", channels: ["ضد روایت", "Iranian Frame"], topic: "مستندهای بین‌المللی", format: "نسخه فارسی + نسخه انگلیسی",
    status: "ایده", owner: "", date: "", impact: "",
  },
];

export default function BoardCollabsPage() {
  return (
    <CollectionManager<CollabItem>
      title="فرصت‌های همکاری و انتشار بین‌کانالی"
      description="ارجاع متقابل مخاطب، انتشار چندزاویه‌ای یک پروژه و همکاری‌های موضوعی میان کانال‌ها."
      storageKey="board-report:collabs:v1"
      seed={SEED}
      fields={FIELDS}
      toRecord={(f) => ({
        id: f.id,
        topic: f.topic,
        channels: f.channels.split(/[,،]/).map((s) => s.trim()).filter(Boolean) as [string, string],
        format: f.format,
        status: f.status as CollabItem["status"],
        owner: f.owner,
        date: f.date,
        impact: f.impact,
      })}
      columns={[
        { key: "topic", label: "موضوع", render: (r) => r.topic },
        {
          key: "channels",
          label: "کانال‌ها",
          render: (r) => (Array.isArray(r.channels) ? r.channels.join(" × ") : String(r.channels ?? "")),
        },
        { key: "format", label: "قالب", render: (r) => r.format },
        { key: "status", label: "وضعیت", render: (r) => r.status },
        { key: "date", label: "تاریخ", render: (r) => r.date || "—" },
      ]}
      newLabel="+ همکاری"
    />
  );
}
