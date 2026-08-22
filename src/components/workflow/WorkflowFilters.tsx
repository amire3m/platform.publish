"use client";

import { Input, Select } from "@/components/ui";

export interface WorkflowFiltersValue {
  query: string;
  attentionOnly: boolean;
  stage: string;
  assignee: string;
  platform: string;
  dueWindow: string;
}

interface Props {
  value: WorkflowFiltersValue;
  onChange: (next: WorkflowFiltersValue) => void;
}

export function WorkflowFilters({ value, onChange }: Props) {
  function patch(p: Partial<WorkflowFiltersValue>) {
    onChange({ ...value, ...p });
  }

  const controlClass = "min-h-[44px]";

  return (
    <div className="rounded-xl border border-tg-border bg-tg-surface p-4" dir="rtl">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="wf-q" className="text-xs font-semibold text-tg-secondary">
            جست‌وجو
          </label>
          <Input
            id="wf-q"
            placeholder="عنوان برنامه یا مجموعه..."
            value={value.query}
            onChange={(e) => patch({ query: e.target.value })}
            className={controlClass}
            aria-label="جست‌وجو در عنوان برنامه"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wf-stage" className="text-xs font-semibold text-tg-secondary">
            مرحله
          </label>
          <Select
            id="wf-stage"
            value={value.stage}
            onChange={(e) => patch({ stage: e.target.value })}
            className={controlClass}
            aria-label="فیلتر مرحله"
          >
            <option value="">همه مراحل</option>
            <option value="production">در حال تولید</option>
            <option value="review">آماده بازبینی</option>
            <option value="ready">آماده انتشار</option>
            <option value="published">منتشرشده</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wf-assignee" className="text-xs font-semibold text-tg-secondary">
            مسئول
          </label>
          <Input
            id="wf-assignee"
            placeholder="نام مسئول"
            value={value.assignee}
            onChange={(e) => patch({ assignee: e.target.value })}
            className={controlClass}
            aria-label="فیلتر مسئول"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wf-platform" className="text-xs font-semibold text-tg-secondary">
            مقصد
          </label>
          <Select
            id="wf-platform"
            value={value.platform}
            onChange={(e) => patch({ platform: e.target.value })}
            className={controlClass}
            aria-label="فیلتر مقصد"
          >
            <option value="">همه مقاصد</option>
            <option value="telegram">تلگرام</option>
            <option value="youtube">یوتیوب</option>
            <option value="instagram">اینستاگرام</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wf-due" className="text-xs font-semibold text-tg-secondary">
            موعد
          </label>
          <Select
            id="wf-due"
            value={value.dueWindow}
            onChange={(e) => patch({ dueWindow: e.target.value })}
            className={controlClass}
            aria-label="فیلتر موعد"
          >
            <option value="">همه موعدها</option>
            <option value="this_week">این هفته</option>
            <option value="overdue">گذشته</option>
            <option value="no_due">بدون موعد</option>
          </Select>
        </div>

        <div className="flex flex-col justify-end gap-1">
          <span className="text-xs font-semibold text-tg-secondary">نیازمند توجه</span>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-tg-border bg-tg-surface px-3">
            <input
              type="checkbox"
              checked={value.attentionOnly}
              onChange={(e) => patch({ attentionOnly: e.target.checked })}
              className="h-4 w-4 rounded border-tg-border text-tg-accent focus:ring-tg-accent"
              aria-label="فقط نیازمند توجه"
            />
            <span className="text-sm text-tg-text">فقط نیازمند توجه</span>
          </label>
        </div>
      </div>
    </div>
  );
}
