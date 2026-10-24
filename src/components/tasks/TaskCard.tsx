"use client";

import { JOB_FUNCTION_LABELS_FA } from "@/lib/job-functions";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/date/jalali";
import type { TaskCardItem } from "./types";

export function isTaskOverdue(card: TaskCardItem, now: number = Date.now()): boolean {
  return card.status === "open" && card.dueAt != null && new Date(card.dueAt).getTime() < now;
}

export default function TaskCard({
  card,
  selected,
  onSelect,
}: {
  card: TaskCardItem;
  selected: boolean;
  onSelect: (taskId: string) => void;
}) {
  const submitted = card.assignments.filter((assignment) => assignment.status === "submitted").length;
  const total = card.assignments.length;
  const overdue = isTaskOverdue(card);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(card.id)}
        aria-current={selected ? "true" : undefined}
        className={
          "flex min-h-[44px] w-full flex-col gap-1 rounded-xl border p-3 text-start transition-colors " +
          (selected
            ? "border-tg-accent bg-tg-accent/10"
            : "border-tg-border bg-tg-surface hover:border-tg-accent/60")
        }
      >
        <span className="block truncate text-sm font-semibold text-tg-text">{card.title}</span>
        {(card.productTitle || card.partNumber != null) && (
          <span className="block truncate text-xs text-tg-secondary">
            {card.productTitle}
            {card.partNumber != null ? ` · قسمت ${toPersianDigits(card.partNumber)}` : ""}
          </span>
        )}
        {card.status === "awaiting_approval" && card.awaitingApprovalAt && (
          <span className="block text-xs tabular-nums text-tg-secondary">
            تحویل: {formatJalaliDateTime(card.awaitingApprovalAt)}
          </span>
        )}
        {card.dueAt && (
          <span className="block text-xs tabular-nums text-tg-secondary">
            موعد: {formatJalaliDateTime(card.dueAt)}
          </span>
        )}
        {overdue && (
          <span className="block text-xs font-semibold text-rose-500">موعد گذشته</span>
        )}
        <span className="flex flex-wrap gap-1">
          {card.assignments.map((assignment) => (
            <span
              key={assignment.jobFunction}
              className={
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] " +
                (assignment.status === "submitted"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-tg-border bg-tg-hover/40 text-tg-secondary")
              }
            >
              <span
                aria-hidden="true"
                className={"h-1.5 w-1.5 rounded-full " + (assignment.status === "submitted" ? "bg-emerald-500" : "bg-tg-secondary")}
              />
              {JOB_FUNCTION_LABELS_FA[assignment.jobFunction]} · {assignment.status === "submitted" ? "ارسال‌شده" : "باز"}
            </span>
          ))}
        </span>
        {total > 1 && (
          <span className="block text-[11px] text-tg-secondary">
            {toPersianDigits(submitted)} از {toPersianDigits(total)} سمت ارسال کرده‌اند
          </span>
        )}
      </button>
    </li>
  );
}

