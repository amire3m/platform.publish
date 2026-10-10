import { describe, expect, it } from "vitest";
import { attachMediaCore } from "./catalog";

describe("attachMediaCore", () => {
  it("keeps old fields and adds null core fields by default", () => {
    const items = [{ id: "a", filename: "x.mp4", fileId: "f1" }];
    const out = attachMediaCore(items, {});
    expect(out[0].id).toBe("a");
    expect(out[0].assetId).toBe(null);
    expect(out[0].version).toBe(null);
  });

  it("attaches asset/version when revision known", () => {
    const out = attachMediaCore([{ id: "a", fileId: "f1" }], {
      f1: { assetId: "MAS-1", version: 3 },
    });
    expect(out[0].assetId).toBe("MAS-1");
    expect(out[0].version).toBe(3);
  });
});
