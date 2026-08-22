"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui";
import { formatJalaliDateOnly } from "@/lib/date/jalali";
import type { WorkflowProgramSummary } from "./types";
import { WorkflowDeliverableRows } from "./WorkflowDeliverableRows";

function nextActionLabel(nextAction: WorkflowProgramSummary["nextAction"]): string {
  if (!nextAction) return "بدون اقدام";
  const map: Record<string, string> = {
    changes_requested: "اصلاح شود",
    publication_failed: "خطای انتشار",
    overdue_production: "تأخیر تولید",
    overdue_publication: "تأخیر انتشار",
    publication_ready: "آماده انتشار",
    production_due: "موعد تولید",
  };
  return map[nextAction.kind] ?? nextAction.kind;
}

interface Props {
  programs: readonly WorkflowProgramSummary[];
  expandedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

export function WorkflowCards({ programs, expandedIds, onToggle }: Props) {
  return (
    <div className="grid gap-4 lg:hidden" dir="rtl">
      {programs.map((program) => {
        const expanded = expandedIds.has(program.id);
        const controlsId = `wf-card-deliverables-${program.id}`;
        const percent = program.progress?.percent ?? 0;
        return (
          <Card key={program.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/workflow/${program.id}`} className="line-clamp-1 font-semibold text-tg-accent hover:underline">
                  {program.title}
                </Link>
                {program.seriesName && <p className="text-xs text-tg-secondary">{program.seriesName}</p>}
                {program.needsAttention && (
                  <span className="mt-1 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    نیازمند توجه
                  </span>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-tg-hover px-2 py-1 text-xs font-medium text-tg-text">
                {nextActionLabel(program.nextAction)}
              </span>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-tg-secondary">پیشرفت</span>
                <span className="font-medium text-tg-text">
                  {program.progress?.complete ? "تکمیل شده" : program.progress?.empty ? "بدون خروجی" : `${percent}٪`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-tg-hover">
                <div className="h-full rounded-full bg-tg-accent" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-tg-secondary">
                {program.progress ? `${program.progress.completedUnits} از ${program.progress.totalUnits} واحد تکمیل` : "—"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-tg-hover/50 px-3 py-2">
                <p className="text-tg-secondary">موعد</p>
                <p className="font-medium text-tg-text">{program.dueAt ? formatJalaliDateOnly(program.dueAt) : "—"}</p>
              </div>
              <div className="rounded-lg bg-tg-hover/50 px-3 py-2">
                <p className="text-tg-secondary">اقدام بعدی</p>
                <p className="font-medium text-tg-text">{nextActionLabel(program.nextAction)}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-tg-border px-2 py-2">
                <p className="text-tg-secondary">تلگرام</p>
                <p className="mt-1 font-medium text-tg-text">—</p>
              </div>
              <div className="rounded-lg border border-tg-border px-2 py-2">
                <p className="text-tg-secondary">یوتیوب</p>
                <p className="mt-1 font-medium text-tg-text">—</p>
              </div>
              <div className="rounded-lg border border-tg-border px-2 py-2">
                <p className="text-tg-secondary">اینستاگرام</p>
                <p className="mt-1 font-medium text-tg-text">—</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onToggle(program.id)}
              aria-expanded={expanded}
              aria-controls={controlsId}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-tg-border bg-tg-surface text-sm font-medium text-tg-text transition hover:bg-tg-hover"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {expanded ? "بستن خروجی‌ها" : "نمایش خروجی‌ها"}
            </button>

            {expanded && (
              <div id={controlsId} role="region" className="overflow-hidden rounded-lg border border-tg-border">
                <WorkflowDeliverableRows program={program} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
