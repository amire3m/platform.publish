import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mirrors/store", () => ({
  getMirrorUrl: vi.fn().mockResolvedValue(null),
}));

import { getMirrorUrl } from "@/lib/mirrors/store";
import { resolvePublishUrl } from "./worker";

describe("resolvePublishUrl", () => {
  it("prefers a ready mirror URL", async () => {
    vi.mocked(getMirrorUrl).mockResolvedValue("https://cdn.example/v.mp4");
    await expect(resolvePublishUrl("file-1")).resolves.toBe("https://cdn.example/v.mp4");
    expect(getMirrorUrl).toHaveBeenCalledWith("file-1");
  });

  it("falls back to the signed proxy without a mirror", async () => {
    vi.mocked(getMirrorUrl).mockResolvedValue(null);
    const url = await resolvePublishUrl("file-1");
    expect(url).toContain("/api/media/telegram/");
  });
});
