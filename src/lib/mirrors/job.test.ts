import { describe, expect, it, vi } from "vitest";

import { mirrorFile } from "./job";
import { FakeVidsClient, VidsApiError } from "./vids";

function stubStore(overrides: Record<string, unknown> = {}) {
  return {
    setSubmitting: vi.fn().mockResolvedValue(true),
    setUploading: vi.fn().mockResolvedValue(true),
    setClaimError: vi.fn().mockResolvedValue(undefined),
    setReady: vi.fn().mockResolvedValue(undefined),
    setError: vi.fn().mockResolvedValue(undefined),
    getTranscriptSrt: vi.fn().mockResolvedValue("1\n00:00:00,000 --> 00:00:02,000\ntest\n"),
    ...overrides,
  };
}

describe("mirrorFile", () => {
  it("waits when the remote has no capacity", async () => {
    const client = new FakeVidsClient();
    vi.spyOn(client, "serverCapacity").mockResolvedValue({
      active_remote: 1,
      queued_remote: 56,
      free_remote: 0,
      max_remote: 1,
      max_concurrent: 1,
    });
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

  it("preserves the claim when remote submission has an uncertain failure", async () => {
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
    expect(out).toBe("pending");
    expect(store.setError).not.toHaveBeenCalled();
  });

  it("releases the claim into error when upstream definitively rejects submission", async () => {
    const client = new FakeVidsClient();
    vi.spyOn(client, "remoteUpload").mockRejectedValue(new VidsApiError("denied", "upload/url", 403));
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
    expect(store.setClaimError).toHaveBeenCalledWith("file-1", expect.any(String), "denied");
  });

  it("preserves the claim when upstream returns a transient server error", async () => {
    const client = new FakeVidsClient();
    vi.spyOn(client, "remoteUpload").mockRejectedValue(new VidsApiError("gateway timeout", "upload/url", 504));
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
    expect(store.setClaimError).not.toHaveBeenCalled();
  });

  it("keeps an accepted upload active when its first status poll fails transiently", async () => {
    const client = new FakeVidsClient();
    vi.spyOn(client, "uploadStatus").mockRejectedValue(new Error("temporary timeout"));
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
    expect(store.setUploading).toHaveBeenCalledOnce();
    expect(store.setError).not.toHaveBeenCalled();
  });

  it("claims the row before remote submission and preserves an uncertain accepted task", async () => {
    const client = new FakeVidsClient();
    const remoteUpload = vi.spyOn(client, "remoteUpload");
    const store = stubStore({ setUploading: vi.fn().mockRejectedValue(new Error("database unavailable")) });

    const out = await mirrorFile({
      client,
      store: store as never,
      partId: "CPP-1",
      fileId: "file-1",
      sourceUrl: "https://example.com/source",
      poll: { tries: 1, intervalMs: 0 },
    });

    expect(out).toBe("pending");
    expect(store.setSubmitting).toHaveBeenCalledBefore(remoteUpload);
    expect(store.setError).not.toHaveBeenCalled();
  });

  it("keeps the claim active when persisting the accepted task loses the compare-and-swap", async () => {
    const client = new FakeVidsClient();
    const store = stubStore({ setUploading: vi.fn().mockResolvedValue(false) });

    const out = await mirrorFile({
      client,
      store: store as never,
      partId: "CPP-1",
      fileId: "file-1",
      sourceUrl: "https://example.com/source",
      poll: { tries: 1, intervalMs: 0 },
    });

    expect(out).toBe("pending");
    expect(store.setReady).not.toHaveBeenCalled();
    expect(store.setError).not.toHaveBeenCalled();
  });
});
