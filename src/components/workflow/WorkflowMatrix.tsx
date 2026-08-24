"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui";
import { formatJalaliDateOnly } from "@/lib/date/jalali";
import type { WorkflowProgramSummary } from "./types";
import { WorkflowDeliverableRows } from "./WorkflowDeliverableRows";
import { workflowNextActionLabelFa } from "@/lib/presentation-fa";

function nextActionLabel(nextAction: WorkflowProgramSummary["nextAction"]): string {
  if (!nextAction) return "—";
  return workflowNextActionLabelFa(nextAction.kind);
}

function ProgressCell({ progress }: { progress: WorkflowProgramSummary["progress"] }) {
  const percent = progress?.percent ?? 0;
  const label = progress?.complete ? "تکمیل شده" : progress?.empty ? "بدون خروجی" : `${percent}٪`;
  return (
    <div className="min-w-[120px]">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-tg-text">{label}</span>
        <span className="text-tg-secondary">
          {progress ? `${progress.completedUnits}/${progress.totalUnits}` : "—"}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-tg-hover">
        <div className="h-full rounded-full bg-tg-accent transition-all" style={{ width: `${percent}%` }} aria-hidden />
      </div>
    </div>
  );
}

interface Props {
  programs: readonly WorkflowProgramSummary[];
  expandedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

export function WorkflowMatrix({ programs, expandedIds, onToggle }: Props) {
  return (
    <div className="hidden lg:block" dir="rtl">
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-tg-border bg-tg-hover/40 text-xs text-tg-secondary">
              <tr>
                <th className="w-10 px-2 py-3" aria-hidden />
                <th className="px-3 py-3 text-right font-semibold">برنامه</th>
                <th className="px-3 py-3 text-right font-semibold">پیشرفت کل</th>
                <th className="px-3 py-3 text-right font-semibold">تولید</th>
                <th className="px-3 py-3 text-center font-semibold">تلگرام</th>
                <th className="px-3 py-3 text-center font-semibold">یوتیوب</th>
                <th className="px-3 py-3 text-center font-semibold">اینستاگرام</th>
                <th className="px-3 py-3 text-right font-semibold">موعد</th>
                <th className="px-3 py-3 text-right font-semibold">اقدام بعدی</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((program) => {
                const expanded = expandedIds.has(program.id);
                const rowId = `wf-row-${program.id}`;
                const controlsId = `wf-deliverables-${program.id}`;
                return (
                  <>
                    <tr key={program.id} id={rowId} className="border-b border-tg-border hover:bg-tg-hover/50">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => onToggle(program.id)}
                          aria-expanded={expanded}
                          aria-controls={controlsId}
                          aria-label={expanded ? "بستن جزئیات" : "نمایش خروجی‌ها"}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-tg-border bg-tg-surface text-tg-secondary transition hover:bg-tg-hover hover:text-tg-text"
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/workflow/${program.id}`} className="font-semibold text-tg-accent hover:underline">
                          {program.title}
                        </Link>
                        {program.seriesName && <p className="text-xs text-tg-secondary">{program.seriesName}</p>}
                        {program.needsAttention && (
                          <span className="mt-1 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            نیازمند توجه
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <ProgressCell progress={program.progress} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs text-tg-secondary">—</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs text-tg-secondary">—</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs text-tg-secondary">—</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-tg-secondary">
                        {program.dueAt ? formatJalaliDateOnly(program.dueAt) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-tg-hover px-2 py-1 text-xs font-medium text-tg-text">
                          {nextActionLabel(program.nextAction)}
                        </span>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${program.id}-expanded`}>
                        <td colSpan={9} className="bg-tg-hover/20 p-0">
                          <div id={controlsId} role="region" aria-labelledby={rowId}>
                            <WorkflowDeliverableRows program={program} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
