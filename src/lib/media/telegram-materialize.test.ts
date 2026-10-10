import { describe, expect, it } from "vitest";
import { materializePlan } from "./telegram-materialize";

describe("materializePlan", () => {
  it("uses single-shot at or below 2GB", () => {
    expect(materializePlan(100).mode).toBe("single");
    expect(materializePlan(2 * 1024 * 1024 * 1024).mode).toBe("single");
  });

  it("uses bundle above 2GB with 500MB parts", () => {
    const plan = materializePlan(2 * 1024 * 1024 * 1024 + 1);
    expect(plan.mode).toBe("bundle");
    if (plan.mode === "bundle") {
      expect(plan.parts).toBe(5);
    }
  });

  it("caps at 8GB total", () => {
    expect(materializePlan(8 * 1024 * 1024 * 1024 + 1).mode).toBe("too_large");
  });
});
