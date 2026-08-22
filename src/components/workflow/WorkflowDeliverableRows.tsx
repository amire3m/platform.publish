"use client";

import { StatusBadge } from "@/components/ui";
import { formatJalaliDateOnly } from "@/lib/date/jalali";
import type { WorkflowProgramSummary } from "./types";

// Deliverable detail is not part of current WorkflowProgramSummary (derived from phase-one API).
// This component renders gracefully with empty state when deliverables are absent, and shows rows when provided.

export interface WorkflowDeliverableRow {
  id: string;
  name: string;
  assigneeLabel?: string | null;
  dueAt?: string | Date | null;
  productionStatus: string;
  telegramStatus?: string | null;
  youtubeStatus?: string | null;
  instagramStatus?: string | null;
}

interface Props {
  program: WorkflowProgramSummary;
  deliverables?: WorkflowDeliverableRow[];
}

export function WorkflowDeliverableRows({ program, deliverables }: Props) {
  const rows = deliverables ?? [];

  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-tg-secondary" dir="rtl">
        خروجی ثبت‌شده‌ای برای «{program.title}» یافت نشد.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" dir="rtl">
      <table className="w-full text-sm">
        <thead className="border-y border-tg-border bg-tg-hover/40 text-xs text-tg-secondary">
          <tr>
            <th className="px-3 py-2 text-right font-semibold">خروجی</th>
            <th className="px-3 py-2 text-right font-semibold">مسئول</th>
            <th className="px-3 py-2 text-right font-semibold">موعد</th>
            <th className="px-3 py-2 text-right font-semibold">تولید</th>
            <th className="px-3 py-2 text-right font-semibold">تلگرام</th>
            <th className="px-3 py-2 text-right font-semibold">یوتیوب</th>
            <th className="px-3 py-2 text-right font-semibold">اینستاگرام</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-b border-tg-border last:border-0">
              <td className="px-3 py-2 font-medium text-tg-text">{d.name}</td>
              <td className="px-3 py-2 text-tg-secondary">{d.assigneeLabel ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-tg-secondary">
                {d.dueAt ? formatJalaliDateOnly(d.dueAt) : "—"}
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <StatusBadge status={d.productionStatus} />
                </span>
              </td>
              <td className="px-3 py-2">
                {d.telegramStatus ? <StatusBadge status={d.telegramStatus} /> : <span className="text-xs text-tg-secondary">—</span>}
              </td>
              <td className="px-3 py-2">
                {d.youtubeStatus ? <StatusBadge status={d.youtubeStatus} /> : <span className="text-xs text-tg-secondary">—</span>}
              </td>
              <td className="px-3 py-2">
                {d.instagramStatus ? <StatusBadge status={d.instagramStatus} /> : <span className="text-xs text-tg-secondary">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
