import { describe, expect, it } from "vitest";
import { partLinkageFor } from "./part-linkage";

describe("partLinkageFor", () => {
  it("maps full video and cover to part slots", () => {
    expect(partLinkageFor("video")).toBe("part-file");
    expect(partLinkageFor("cover")).toBe("part-cover");
  });

  it("maps output kinds to asset rows", () => {
    for (const kind of ["highlight", "reel", "clean", "final", "report"]) {
      expect(partLinkageFor(kind)).toBe("part-asset");
    }
  });

  it("falls back to asset rows for unknown kinds", () => {
    expect(partLinkageFor("trailer")).toBe("part-asset");
  });
});
