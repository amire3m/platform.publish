import { describe, expect, it } from "vitest";
import { contentTypeFromPath } from "./client";

describe("contentTypeFromPath", () => {
  it("recognizes browser-playable video formats", () => {
    expect(contentTypeFromPath("videos/file.mp4")).toBe("video/mp4");
    expect(contentTypeFromPath("documents/file.webm")).toBe("video/webm");
    expect(contentTypeFromPath("documents/file.mov")).toBe("video/quicktime");
  });

  it("returns null for unknown file extensions", () => {
    expect(contentTypeFromPath("documents/file.bin")).toBeNull();
  });
});
