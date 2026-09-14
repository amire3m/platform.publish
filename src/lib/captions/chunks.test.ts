import { describe, expect, it } from "vitest";

import { planAudioChunks } from "./chunks";

describe("planAudioChunks", () => {
  it("single chunk for short audio", () => {
    expect(planAudioChunks(300)).toEqual([{ index: 0, start: 0, end: 300 }]);
  });

  it("splits long audio with overlap", () => {
    expect(planAudioChunks(1300, 600, 30)).toEqual([
      { index: 0, start: 0, end: 600 },
      { index: 1, start: 570, end: 1170 },
      { index: 2, start: 1140, end: 1300 },
    ]);
  });
});
