"use client";

import type { ContentPart } from "./types";
import { ACTIVITY_LABELS } from "./room-model";
import { PART_ACTIVITIES } from "@/lib/content-room/activities";

const ACTIVITY_ORDER = PART_ACTIVITIES;

export function PartActivitiesGrid({
  parts,
  onToggle,
}: {
  parts: ContentPart[];
  onToggle: (partId: string, activity: string, isDone: boolean) => void;
}) {
  const activities = ACTIVITY_ORDER;
  const activeParts = parts.filter((p) => (p.isActive ?? true));

  if (activeParts.length === 0) {
    return <p className="text-sm text-tg-secondary">قسمتی فعال یافت نشد.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-tg-border">
      <table className="w-full min-w-[720px] text-sm" dir="rtl">
        <thead className="bg-tg-hover/40 text-xs text-tg-secondary">
          <tr>
            <th className="px-3 py-2 text-right font-semibold">قسمت</th>
            {activities.map((a) => (
              <th
                key={a}
                className={`px-2 py-2 text-center font-semibold ${a === "previously_published" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : ""}`}
              >
                {ACTIVITY_LABELS[a] ?? a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...activeParts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => {
              const isPreviouslyPublished = Boolean(p.activities?.previously_published);
              return (
                <tr key={p.id} className="border-t border-tg-border hover:bg-tg-hover/30">
                  <td className="px-3 py-2 font-medium text-tg-text">قسمت {p.partNumber}</td>
                  {activities.map((a) => {
                    const checked = Boolean(p.activities?.[a]);
                    const disabled = a !== "previously_published" && isPreviouslyPublished;
                    return (
                      <td key={a} className={`px-2 py-2 text-center ${a === "previously_published" ? "bg-amber-500/5" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => onToggle(p.id, a, e.target.checked)}
                          className="h-4 w-4 rounded border-tg-border text-tg-accent focus:ring-tg-accent disabled:opacity-40"
                          aria-label={`${ACTIVITY_LABELS[a] ?? a} برای قسمت ${p.partNumber}`}
                          title={disabled ? "این قسمت قبلاً منتشر شده است؛ سایر فعالیت‌ها غیرفعال است." : undefined}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-tg-secondary">تیک «قبلاً منتشر شده» سایر فعالیت‌های همان قسمت را غیرفعال می‌کند و آن قسمت در ارسال به انتشار نادیده گرفته می‌شود.</p>
    </div>
  );
}
