"use client";

import { Card } from "@/components/ui";
import { Activity, AlertTriangle, CalendarCheck, LayoutList } from "lucide-react";
import type { WorkflowProgramSummary } from "./types";

function formatAverage(days: number) {
  return `${days}٪`;
}

function countDueThisWeek(programs: readonly WorkflowProgramSummary[]): number {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  let count = 0;
  for (const p of programs) {
    if (!p.dueAt) continue;
    const t = new Date(p.dueAt).getTime();
    if (Number.isNaN(t)) continue;
    const diff = t - now;
    if (diff >= 0 && diff <= weekMs) count += 1;
  }
  return count;
}

export function WorkflowSummary({ programs }: { programs: readonly WorkflowProgramSummary[] }) {
  const total = programs.length;
  const attention = programs.filter((p) => p.needsAttention).length;
  const average =
    total === 0 ? 0 : Math.round(programs.reduce((s, p) => s + (p.progress?.percent ?? 0), 0) / total);
  const dueWeek = countDueThisWeek(programs);

  const items = [
    { label: "برنامه‌های فعال", value: String(total), icon: LayoutList },
    { label: "میانگین پیشرفت", value: formatAverage(average), icon: Activity },
    { label: "نیازمند توجه", value: String(attention), icon: AlertTriangle },
    { label: "موعد این هفته", value: String(dueWeek), icon: CalendarCheck },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" dir="rtl">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="flex items-center gap-4 py-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tg-accent-soft text-tg-accent">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs text-tg-secondary">{item.label}</p>
              <p className="text-lg font-bold text-tg-text">{item.value}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
