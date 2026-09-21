import { describe, expect, it } from "vitest";
import { cosineSimilarity, extractKeywords } from "./keywords";

describe("radar keywords", () => {
  it("extracts fa and en keywords", () => {
    const { fa, en } = extractKeywords("مستند طبیعت ایران و آموزش تدوین ویدیو with youtube tutorial and nature", 2, 2);
    expect(fa.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
  });
  it("cosine similarity is high for similar titles", () => {
    expect(cosineSimilarity("آموزش تدوین ویدیو", "آموزش تدوین ویدیو حرفه‌ای")).toBeGreaterThan(0.5);
    expect(cosineSimilarity("مستند طبیعت", "آموزش آشپزی")).toBeLessThan(0.3);
  });
});
