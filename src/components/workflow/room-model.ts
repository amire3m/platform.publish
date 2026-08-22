import type { WorkflowProgramSummary, WorkflowRoomFilters, WorkflowProgramGroup } from "./types";

/**
 * Pure, stable filtering for workflow room.
 * Uses server-provided needsAttention and progress/nextAction without recalculating business rules.
 * Does not mutate input array.
 */
export function filterPrograms(
  programs: readonly WorkflowProgramSummary[],
  filters: WorkflowRoomFilters,
): WorkflowProgramSummary[] {
  const attentionOnly = Boolean(filters.attentionOnly);
  const rawQuery = filters.query ?? "";
  const query = rawQuery.trim().toLowerCase();
  const hasQuery = query.length > 0;

  // Keep filtering pure and stable: preserve original order, return new array.
  return programs.filter((program) => {
    if (attentionOnly && !program.needsAttention) return false;
    if (hasQuery) {
      const title = (program.title ?? "").toLowerCase();
      const series = (program.seriesName ?? "").toLowerCase();
      // Match title or seriesName; normalized includes Persian characters natively.
      const haystack = `${title} ${series}`.trim();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function groupWorkflowPrograms(
  programs: readonly WorkflowProgramSummary[],
): WorkflowProgramGroup {
  const attention: WorkflowProgramSummary[] = [];
  const rest: WorkflowProgramSummary[] = [];
  for (const program of programs) {
    if (program.needsAttention) attention.push(program);
    else rest.push(program);
  }
  return { attention, rest };
}

/**
 * Factory for default filters; keeps UI state shape consistent.
 * Server-provided filtering semantics remain pure/stale-free.
 */
export function workflowRoomFilters(
  overrides: Partial<WorkflowRoomFilters> = {},
): WorkflowRoomFilters {
  return {
    attentionOnly: overrides.attentionOnly ?? false,
    query: overrides.query ?? "",
  };
}

/**
 * Summary helper that uses server-provided progress/nextAction without recomputation.
 */
export function summarizeWorkflowRoom(programs: readonly WorkflowProgramSummary[]) {
  const total = programs.length;
  const attentionCount = programs.filter((p) => p.needsAttention).length;
  // Use server-provided progress; do not recalculate.
  const totalPercent = total === 0 ? 0 : Math.round(programs.reduce((sum, p) => sum + (p.progress?.percent ?? 0), 0) / total);
  return { total, attentionCount, averageProgress: totalPercent };
}
