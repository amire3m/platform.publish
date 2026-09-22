import { describe, expect, it } from "vitest";
import { runReadinessProbe } from "./readiness";

describe("readiness", () => {
  it("returns pass or fail with checks", async () => {
    const r = await runReadinessProbe();
    expect(["pass", "fail"]).toContain(r.status);
    expect(r.checks.length).toBeGreaterThan(3);
    expect(r.checks.some((c) => c.id === "telegram")).toBe(true);
  });
});
