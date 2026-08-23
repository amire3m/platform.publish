"use client";

import { Input, Select } from "@/components/ui";
import type { ContentRoomFilters } from "./types";

interface Props {
  value: ContentRoomFilters;
  onChange: (next: ContentRoomFilters) => void;
}

export function ContentRoomFilters({ value, onChange }: Props) {
  function patch(p: Partial<ContentRoomFilters>) {
    onChange({ ...value, ...p });
  }
  const controlClass = "min-h-[44px]";

  return (
    <div className="rounded-xl border border-tg-border bg-tg-surface p-4" dir="rtl">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="cr-q" className="text-xs font-semibold text-tg-secondary">
            جست‌وجو
          </label>
          <Input
            id="cr-q"
            placeholder="عنوان محصول..."
            value={value.query}
            onChange={(e) => patch({ query: e.target.value })}
            className={controlClass}
            aria-label="جست‌وجو در عنوان محصول"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cr-type" className="text-xs font-semibold text-tg-secondary">
            نوع محصول
          </label>
          <Select
            id="cr-type"
            value={value.productType}
            onChange={(e) => patch({ productType: e.target.value })}
            className={controlClass}
            aria-label="فیلتر نوع محصول"
          >
            <option value="">همه انواع</option>
            <option value="serial">سریال</option>
            <option value="documentary">مستند</option>
            <option value="tv_program">برنامه تلویزیونی</option>
            <option value="film">فیلم سینمایی</option>
            <option value="short_film">فیلم کوتاه</option>
            <option value="educational">آموزشی</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cr-channel" className="text-xs font-semibold text-tg-secondary">
            کانال
          </label>
          <Select
            id="cr-channel"
            value={value.channel}
            onChange={(e) => patch({ channel: e.target.value })}
            className={controlClass}
            aria-label="فیلتر کانال"
          >
            <option value="">همه کانال‌ها</option>
            <option value="zed_revayat">ضد روایت</option>
            <option value="zaviye_no">زاویه نو</option>
            <option value="tamashin">تماشین</option>
            <option value="iranian_frame">Iranian Frame</option>
            <option value="shock">شوک</option>
            <option value="tinazh">تیناژ</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cr-status" className="text-xs font-semibold text-tg-secondary">
            وضعیت
          </label>
          <Select
            id="cr-status"
            value={value.status}
            onChange={(e) => patch({ status: e.target.value })}
            className={controlClass}
            aria-label="فیلتر وضعیت"
          >
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
      </div>
    </div>
  );
}
