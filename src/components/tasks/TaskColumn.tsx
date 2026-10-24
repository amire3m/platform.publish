"use client";

import { Button, Card, Skeleton } from "@/components/ui";
import { toPersianDigits } from "@/lib/date/jalali";
import TaskCard from "./TaskCard";
import { TASK_COLUMN_LABELS, type TaskCardItem, type TaskColumnKey } from "./types";

export interface TaskColumnState {
  items: TaskCardItem[];
  total: number;
  isLoading: boolean;
  error: unknown;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}

export default function TaskColumn({
  column,
  state,
  selectedId,
  onSelect,
  isFiltered,
  onClearFilters,
}: {
  column: TaskColumnKey;
  state: TaskColumnState;
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  isFiltered: boolean;
  onClearFilters: () => void;
}) {
  const { items, total, isLoading, error, hasMore, onLoadMore, onRetry } = state;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-tg-text">{TASK_COLUMN_LABELS[column]}</h2>
        <span className="text-xs text-tg-secondary">{toPersianDigits(total)} کار</span>
      </div>

      {isLoading && items.length === 0 && (
        <div className="flex flex-col gap-2" aria-label="در حال بارگذاری">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error != null && items.length === 0 && (
        <Card className="p-4 text-center">
          <p className="text-sm text-rose-600">خطا در دریافت ستون</p>
          <Button size="sm" variant="secondary" onClick={onRetry} className="mt-2 min-h-[44px]">
            تلاش دوباره
          </Button>
        </Card>
      )}

      {!isLoading && !error && items.length === 0 && (
        <Card className="p-4 text-center">
          {isFiltered ? (
            <>
              <p className="text-sm text-tg-secondary">موردی با این فیلترها یافت نشد</p>
              <Button size="sm" variant="secondary" onClick={onClearFilters} className="mt-2 min-h-[44px]">
                پاک کردن فیلترها
              </Button>
            </>
          ) : (
            <p className="text-sm text-tg-secondary">کاری برای نمایش وجود ندارد</p>
          )}
        </Card>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((card) => (
            <TaskCard key={card.id} card={card} selected={card.id === selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}

      {hasMore && !error && (
        <Button variant="secondary" onClick={onLoadMore} className="min-h-[44px] w-full">
          نمایش بیشتر
        </Button>
      )}
    </div>
  );
}

