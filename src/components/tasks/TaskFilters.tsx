"use client";

import { Button, Input, Label, Select } from "@/components/ui";
import { JOB_FUNCTIONS, JOB_FUNCTION_LABELS_FA } from "@/lib/job-functions";
import type { TaskBoardFilters } from "./types";

export interface ProductOption {
  id: string;
  title: string;
}

const DUE_OPTIONS = [
  { value: "", label: "همه موعدها" },
  { value: "overdue", label: "گذشته از موعد" },
  { value: "today", label: "امروز" },
  { value: "week", label: "هفته آینده" },
  { value: "none", label: "بدون موعد" },
];

const COMPLETED_OPTIONS = [
  { value: "recent", label: "۳۰ روز اخیر" },
  { value: "all", label: "همه تکمیل‌شده‌ها" },
  { value: "custom", label: "بازه دلخواه" },
];

export default function TaskFilters({
  filters,
  onChange,
  onClear,
  isFiltered,
  products,
}: {
  filters: TaskBoardFilters;
  onChange: (patch: Partial<TaskBoardFilters>) => void;
  onClear: () => void;
  isFiltered: boolean;
  products: ProductOption[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-40 flex-1">
        <Label>
          جستجو
          <Input
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="عنوان یا محصول…"
            className="mt-1 min-h-[44px]"
            aria-label="جستجو"
          />
        </Label>
      </div>
      <div>
        <Label>
          سمت
          <Select
            value={filters.jobFunction}
            onChange={(event) => onChange({ jobFunction: event.target.value })}
            className="mt-1 min-h-[44px]"
            aria-label="سمت"
          >
            <option value="">همه سمت‌ها</option>
            {JOB_FUNCTIONS.map((job) => (
              <option key={job} value={job}>
                {JOB_FUNCTION_LABELS_FA[job]}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      <div>
        <Label>
          موعد
          <Select
            value={filters.due}
            onChange={(event) => onChange({ due: event.target.value })}
            className="mt-1 min-h-[44px]"
            aria-label="موعد"
          >
            {DUE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      {products.length > 0 && (
        <div>
          <Label>
            محصول
            <Select
              value={filters.productId}
              onChange={(event) => onChange({ productId: event.target.value })}
              className="mt-1 min-h-[44px]"
              aria-label="محصول"
            >
              <option value="">همه محصولات</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </Select>
          </Label>
        </div>
      )}
      <div>
        <Label>
          تکمیل‌شده‌ها
          <Select
            value={filters.completedMode}
            onChange={(event) => onChange({ completedMode: event.target.value as TaskBoardFilters["completedMode"] })}
            className="mt-1 min-h-[44px]"
            aria-label="بازه تکمیل"
          >
            {COMPLETED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      {filters.completedMode === "custom" && (
        <>
          <div>
            <Label>
              از تاریخ
              <Input
                type="date"
                value={filters.completedFrom}
                onChange={(event) => onChange({ completedFrom: event.target.value })}
                className="mt-1 min-h-[44px]"
                aria-label="از تاریخ"
              />
            </Label>
          </div>
          <div>
            <Label>
              تا تاریخ
              <Input
                type="date"
                value={filters.completedTo}
                onChange={(event) => onChange({ completedTo: event.target.value })}
                className="mt-1 min-h-[44px]"
                aria-label="تا تاریخ"
              />
            </Label>
          </div>
        </>
      )}
      {isFiltered && (
        <Button variant="secondary" onClick={onClear} className="min-h-[44px]">
          پاک کردن فیلترها
        </Button>
      )}
    </div>
  );
}

