import { describe, expect, it, vi } from "vitest";

import { mirrorFile } from "./job";
import { FakeVidsClient } from "./vids";

function stubStore(overrides: Record<string, unknown> = {}) {
  return {
    setUploading: vi.fn().mockResolvedValue(undefined),
    setReady: vi.fn().mockResolvedValue(undefined),
    setError: vi.fn().mockResolvedValue(undefined),
    getTranscriptSrt: vi.fn().mockResolvedValue("1\n00:00:00,000 --> 00:00:02,000\ntest\n"),
    ...overrides,
  };
}

describe("mirrorFile", () => {
  it("waits when the remote has no capacity", async () => {
    const client = new FakeVidsClient();
    vi.spyOn(client, "serverCapacity").mockResolvedValue({ free_remote: 0, max_concurrent: 10 });
    const remoteUpload = vi.spyOn(client, "remoteUpload");
    const store = stubStore();
    const out = await mirrorFile({
      client,
      store: store as never,
      partId: "CPP-1",
      fileId: "file-1",
      sourceUrl: "https://example.com/source",
      poll: { tries: 1, intervalMs: 0 },
    });
    expect(out).toBe("pending");
    expect(remoteUpload).not.toHaveBeenCalled();
  });

  it("mirrors end to end and uploads Persian subtitles", async () => {
    const client = new FakeVidsClient();
    const store = stubStore();
    const subtitle = vi.spyOn(client, "uploadSubtitle");
    const out = await mirrorFile({
      client,
      store: store as never,
      partId: "CPP-1",
      fileId: "file-1",
      sourceUrl: "https://example.com/source",
      poll: { tries: 3, intervalMs: 0 },
    });
    expect(out).toBe("ready");
    expect(store.setReady).toHaveBeenCalledWith("file-1", expect.any(String), expect.stringContaining("https://cdn.fake/"));
    expect(subtitle).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.stringContaining("test"));
  });

  it("marks error when the remote fails", async () => {
    const client = new FakeVidsClient();
    vi.spyOn(client, "remoteUpload").mockRejectedValue(new Error("denied"));
    const store = stubStore();
    const out = await mirrorFile({
      client,
      store: store as never,
      partId: "CPP-1",
      fileId: "file-1",
      sourceUrl: "https://example.com/source",
      poll: { tries: 1, intervalMs: 0 },
    });
    expect(out).toBe("error");
    expect(store.setError).toHaveBeenCalledWith("file-1", expect.stringContaining("denied"));
  });
});
