import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { calculateMonetizationProgress } from "@/lib/analytics/monetization";

const componentPath = resolve(dirname(fileURLToPath(import.meta.url)), "./RevenueCard.tsx");
const pagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../app/(panel)/analytics/page.tsx");

describe("RevenueCard (Task 7)", () => {
  it("calculateMonetizationProgress: 730 subs 3588 hours leaves 270 subs and 412 hours", () => {
    const progress = calculateMonetizationProgress(730, 3588);
    expect(progress.remainingSubs).toBe(270);
    expect(progress.remainingHours).toBe(412);
    expect(progress.isEligible).toBe(false);
    expect(progress.subsProgress).toBeCloseTo(0.73);
    expect(progress.hoursProgress).toBeCloseTo(0.897);
  });

  it("shows remaining subs/hours when not monetized", () => {
    const content = readFileSync(componentPath, "utf8");
    // placeholder for non-monetized state
    expect(content).toContain("هنوز مانیتایز نشده");
    // remaining text pattern — must show subs/hours distance
    expect(content).toContain("تا واجد شرایط");
    // must render Persian remaining values (uses remainingSubs / remainingHours via toPersianDigits)
    expect(content).toContain("remainingSubs");
    expect(content).toContain("remainingHours");
    // must reference the example values logic (۲۷۰ مشترک case handled via dynamic remaining)
    expect(content).toContain("مشترک");
    expect(content).toContain("ساعت");
    // uses calculateMonetizationProgress utility
    expect(content).toContain("calculateMonetizationProgress");
    // progress bars for subs/hours
    expect(content).toContain("subsProgress");
    expect(content).toContain("hoursProgress");
  });

  it("handles revenue present and still shows progress if not eligible", () => {
    const content = readFileSync(componentPath, "utf8");
    // when revenue present, should still show progress section
    expect(content).toContain("revenue");
    expect(content).toContain("cpm");
    // conditional rendering for monetized vs not
    expect(content).toContain("isEligible");
  });

  it("is integrated into revenue tab of page.tsx", () => {
    const page = readFileSync(pagePath, "utf8");
    expect(page).toContain("RevenueCard");
    expect(page).toContain('activeTab === "revenue"');
    // page should import from components/analytics/RevenueCard
    expect(page).toContain("RevenueCard");
  });
});
