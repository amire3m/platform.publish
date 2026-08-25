import { describe, expect, it } from "vitest";

import { calculateMonetizationProgress } from "./monetization";

describe("calculateMonetizationProgress", () => {
  it("returns remaining subs/hours and eligibility for 730 subs 3588 hours", () => {
    expect(calculateMonetizationProgress(730, 3588)).toEqual({
      subsProgress: 0.73,
      hoursProgress: 0.897,
      remainingSubs: 270,
      remainingHours: 412,
      isEligible: false,
    });
  });

  it("clamps progress at 1 and remaining at 0 when exceeded", () => {
    expect(calculateMonetizationProgress(1500, 5000)).toEqual({
      subsProgress: 1,
      hoursProgress: 1,
      remainingSubs: 0,
      remainingHours: 0,
      isEligible: true,
    });
  });

  it("returns zeros when both are zero", () => {
    expect(calculateMonetizationProgress(0, 0)).toEqual({
      subsProgress: 0,
      hoursProgress: 0,
      remainingSubs: 1000,
      remainingHours: 4000,
      isEligible: false,
    });
  });

  it("is eligible exactly at thresholds", () => {
    expect(calculateMonetizationProgress(1000, 4000).isEligible).toBe(true);
  });
});
