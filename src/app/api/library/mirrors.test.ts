import { describe, expect, it } from "vitest";

import { attachMirrorUrls } from "./route";

describe("attachMirrorUrls", () => {
  it("attaches ready mirror URLs and null otherwise", () => {
    const items = [
      { id: "a", fileId: "f1" },
      { id: "b", fileId: "f2" },
      { id: "c", fileId: null },
    ];
    const out = attachMirrorUrls(items, { f1: "https://cdn.example/a.mp4" });
    expect(out[0].mirrorUrl).toBe("https://cdn.example/a.mp4");
    expect(out[1].mirrorUrl).toBeNull();
    expect(out[2].mirrorUrl).toBeNull();
  });
});
