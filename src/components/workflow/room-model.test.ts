import { describe, expect, it } from "vitest";

import { filterPrograms } from "./room-model";
import type { WorkflowProgramSummary } from "./types";

function summary(patch: Partial<WorkflowProgramSummary> & { id: string }): WorkflowProgramSummary {
  return {
    title: patch.title ?? patch.id,
    progress: patch.progress ?? { completedUnits: 0, totalUnits: 1, percent: 0, complete: false, empty: false },
    nextAction: patch.nextAction ?? null,
    needsAttention: patch.needsAttention ?? false,
    seriesName: patch.seriesName ?? null,
    ownerUserId: patch.ownerUserId ?? null,
    dueAt: patch.dueAt ?? null,
    notes: patch.notes ?? null,
    ...patch,
  } as WorkflowProgramSummary;
}

const rows: WorkflowProgramSummary[] = [
  summary({ id: "late", title: "برنامه تاخیری", needsAttention: true }),
  summary({ id: "failed", title: "برنامه ناموفق", needsAttention: true }),
  summary({ id: "ok", title: "برنامه عادی", needsAttention: false }),
  summary({ id: "forat-item", title: "مستند فرات", needsAttention: false }),
];

describe("filterPrograms", () => {
  it("filters by attention", () => {
    expect(filterPrograms(rows, { attentionOnly: true, query: "" }).map((row) => row.id)).toEqual(["late", "failed"]);
  });

  it("filters by query", () => {
    expect(filterPrograms(rows, { attentionOnly: false, query: "فرات" })).toHaveLength(1);
  });

  it("keeps original order stable and pure", () => {
    const originalIds = rows.map((r) => r.id);
    const filtered = filterPrograms(rows, { attentionOnly: true, query: "" });
    expect(rows.map((r) => r.id)).toEqual(originalIds);
    expect(filtered.map((r) => r.id)).toEqual(["late", "failed"]);
  });

  it("handles empty query and no attention filter", () => {
    expect(filterPrograms(rows, { attentionOnly: false, query: "" })).toHaveLength(rows.length);
  });

  it("trims and matches case-insensitively", () => {
    expect(filterPrograms(rows, { attentionOnly: false, query: "  فرات  " })).toHaveLength(1);
  });
});
