import { describe, expect, it } from "vitest";
import { chunkPlan, nextMissingChunk } from "./upload-sessions";

describe("chunkPlan", () => {
  it("splits 20MB into 8MB chunks", () => {
    expect(chunkPlan(20 * 1024 * 1024, 8 * 1024 * 1024)).toEqual([0, 1, 2]);
  });
  it("finds missing chunk", () => {
    expect(nextMissingChunk([0, 2], 3)).toBe(1);
    expect(nextMissingChunk([0, 1, 2], 3)).toBe(null);
  });
});
