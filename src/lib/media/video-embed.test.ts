import { describe, expect, it } from "vitest";
import { getVideoEmbedUrl } from "./video-embed";

describe("getVideoEmbedUrl", () => {
  it("builds privacy-enhanced YouTube embed URLs", () => {
    expect(getVideoEmbedUrl("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(getVideoEmbedUrl("youtube", "https://youtu.be/dQw4w9WgXcQ?t=12")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("builds Instagram embed URLs", () => {
    expect(getVideoEmbedUrl("instagram", "https://www.instagram.com/reel/ABC_123-/")).toBe(
      "https://www.instagram.com/reel/ABC_123-/embed/",
    );
  });

  it("rejects unsupported hosts and malformed URLs", () => {
    expect(getVideoEmbedUrl("youtube", "https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(getVideoEmbedUrl("instagram", "not-a-url")).toBeNull();
  });
});
