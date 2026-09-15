"use client";

import { CollectionManager, type CollectionField } from "@/components/board/CollectionManager";
import type { IdeaItem } from "@/lib/board/types";

const FIELDS: CollectionField[] = [
  { key: "title", label: "عنوان ایده *", type: "text", required: true, span: true },
  { key: "channel", label: "کانال مناسب", type: "select", options: ["زاویه نو", "ضد روایت", "تماشین", "Iranian Frame"] },
  { key: "contentType", label: "نوع محتوا", type: "text" },
  { key: "audience", label: "مخاطب هدف", type: "text", span: true },
  { key: "cost", label: "هزینه تولید", type: "select", options: ["کم", "متوسط", "زیاد"] },
  { key: "duration", label: "مدت زمان تولید", type: "text" },
  { key: "capacity", label: "ظرفیت انتشار", type: "text" },
  { key: "sponsor", label: "امکان اسپانسرگیری", type: "select", options: ["دارد", "ندارد", "نامشخص"] },
  { key: "status", label: "وضعیت ایده", type: "select", options: ["ایده", "در بررسی", "تأیید شده", "در تولید", "رد شده"] },
  { key: "priority", label: "اولویت", type: "select", options: ["اول", "دوم", "سوم"] },
  { key: "notes", label: "توضیحات", type: "textarea", span: true },
];

const SEED: IdeaItem[] = [
  {
    id: "demo-bts", title: "مستند پشت‌صحنه سریال‌ها", channel: "تماشین", contentType: "مستند پشت‌صحنه",
    audience: "مخاطبان سریال‌ها و علاقه‌مندان سینما", cost: "کم", duration: "۲ هفته", capacity: "هفتگی",
    sponsor: "دارد", status: "ایده", priority: "اول",
    notes: "پیش‌تولید، پشت صحنه، گفت‌وگو با عوامل و مشکلات تولید — اولویت با آثار پروداکشن سنگین.",
  },
  {
    id: "demo-talk", title: "گفت‌وگوی آسیب‌های اجتماعی", channel: "زاویه نو", contentType: "گفت‌وگو",
    audience: "عموم مخاطبان اجتماعی", cost: "کم", duration: "۱ هفته", capacity: "هفتگی",
    sponsor: "نامشخص", status: "ایده", priority: "دوم", notes: "گفت‌وگو پیرامون مسائل اجتماعی و سیاسی روز.",
  },
  {
    id: "demo-cine", title: "تحلیل آثار سینمایی", channel: "ضد روایت", contentType: "تحلیلی",
    audience: "علاقه‌مندان سینما", cost: "کم", duration: "۱ هفته", capacity: "دوهفته‌ای",
    sponsor: "ندارد", status: "ایده", priority: "دوم", notes: "تحلیل آثار سینمایی و تلویزیونی با زاویه مستند.",
  },
];

export default function BoardFuturePage() {
  return (
    <CollectionManager<IdeaItem>
      title="پیشنهادهای توسعه تولید محتوای ویژه یوتیوب"
      description="اولویت اول: مستند پشت‌صحنه و روند تولید (به‌خصوص سریال‌ها و تولیدات سنگین). اولویت دوم: برنامه‌های گفت‌وگومحور."
      storageKey="board-report:ideas:v1"
      seed={SEED}
      fields={FIELDS}
      columns={[
        { key: "title", label: "عنوان", render: (r) => r.title },
        { key: "channel", label: "کانال", render: (r) => r.channel },
        { key: "priority", label: "اولویت", render: (r) => r.priority },
        { key: "cost", label: "هزینه", render: (r) => r.cost },
        { key: "status", label: "وضعیت", render: (r) => r.status },
      ]}
      newLabel="+ ایده"
    />
  );
}
