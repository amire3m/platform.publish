import { describe, expect, it } from "vitest";

import { planPartsReconciliation } from "./activities";

function part(id: string, partNumber: number, isActive = true) {
  return { id, partNumber, isActive };
}

describe("planPartsReconciliation", () => {
  it("returns empty plan when counts already match", () => {
    expect(planPartsReconciliation([part("a", 1), part("b", 2)], 2)).toEqual({
      deactivateIds: [],
      reactivateIds: [],
      newPartNumbers: [],
    });
  });

  it("deactivates trailing parts by partNumber on decrease", () => {
    expect(planPartsReconciliation([part("a", 1), part("b", 2), part("c", 3)], 2)).toEqual({
      deactivateIds: ["c"],
      reactivateIds: [],
      newPartNumbers: [],
    });
  });

  it("on decrease hides by partNumber even with gaps in active flags", () => {
    // part 2 already hidden; part 3 exceeds newCount so it hides, then part 2
    // reactivates to converge the active count back to the new count
    const plan = planPartsReconciliation([part("a", 1), part("b", 2, false), part("c", 3)], 2);
    expect(plan.deactivateIds).toEqual(["c"]);
    expect(plan.reactivateIds).toEqual(["b"]);
    expect(plan.newPartNumbers).toEqual([]);
  });

  it("reactivates hidden parts before creating new ones on increase", () => {
    const plan = planPartsReconciliation([part("a", 1), part("b", 2), part("c", 3, false)], 3);
    expect(plan.deactivateIds).toEqual([]);
    expect(plan.reactivateIds).toEqual(["c"]);
    expect(plan.newPartNumbers).toEqual([]);
  });

  it("creates new sequential partNumbers when nothing hidden is left", () => {
    const plan = planPartsReconciliation([part("a", 1), part("b", 2)], 4);
    expect(plan.deactivateIds).toEqual([]);
    expect(plan.reactivateIds).toEqual([]);
    expect(plan.newPartNumbers).toEqual([3, 4]);
  });

  it("reactivates first, then creates the remainder on increase", () => {
    const plan = planPartsReconciliation([part("a", 1), part("b", 2, false)], 4);
    expect(plan.deactivateIds).toEqual([]);
    expect(plan.reactivateIds).toEqual(["b"]);
    expect(plan.newPartNumbers).toEqual([3, 4]);
  });
});
