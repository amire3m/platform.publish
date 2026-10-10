import { describe, expect, it } from "vitest";
import { InMemoryMediaStorage } from "./storage";

describe("InMemoryMediaStorage", () => {
  it("stores bytes and returns stable object id", async () => {
    const s = new InMemoryMediaStorage();
    const out = await s.putSingle({ filename: "a.mp4", mime: "video/mp4", bytes: new Uint8Array([1, 2, 3]) });
    expect(out.objectId.length).toBeGreaterThan(3);
    expect(out.size).toBe(3);
  });
});
