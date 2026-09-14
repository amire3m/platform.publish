import { describe, expect, it } from "vitest";

import { buildSrt, formatSrtTime, mergeSegments } from "./srt";

describe("srt", () => {
  it("formats time", () => {
    expect(formatSrtTime(61.5)).toBe("00:01:01,500");
  });

  it("merges chunk offsets and sorts", () => {
    const out = mergeSegments([
      { offset: 570, segments: [{ start: 0, end: 5, text: "b" }] },
      { offset: 0, segments: [{ start: 0, end: 5, text: "a" }] },
    ]);
    expect(out).toEqual([
      { start: 0, end: 5, text: "a" },
      { start: 570, end: 575, text: "b" },
    ]);
  });

  it("builds numbered SRT blocks", () => {
    expect(buildSrt([{ start: 0, end: 2, text: "test" }])).toBe("1\n00:00:00,000 --> 00:00:02,000\ntest\n");
  });
});
