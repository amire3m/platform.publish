import { describe, expect, it } from "vitest";

import { ANALYTICS_SNAPSHOT_ID_SUFFIX, generateEntityId } from "@/lib/ids";

describe("generateEntityId", () => {
  it("preserves the six-digit suffix of persisted legacy entity IDs", () => {
    expect(generateEntityId("CNT")).toMatch(/^CNT-\d{4}-\d{6}$/);
  });

  it("gives analytics snapshots at least 95 bits of configured suffix entropy", () => {
    const id = generateEntityId("ANS");

    expect(id).toMatch(/^ANS-\d{4}-[0-9A-Za-z]{16,}$/);
    expect(
      ANALYTICS_SNAPSHOT_ID_SUFFIX.length *
      Math.log2(ANALYTICS_SNAPSHOT_ID_SUFFIX.alphabet.length),
    ).toBeGreaterThanOrEqual(95);
  });
});
