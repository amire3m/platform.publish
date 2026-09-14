import { describe, expect, it, vi, afterEach } from "vitest";

import { mirrorFile } from "./job";
import { FakeVidsClient } from "./vids";
import { maybeMirrorAfterLink } from "./job";

function stubStore(overrides: Record<string, unknown> = {}) {
  return {
    setUploading: vi.fn().mockResolvedValue(undefined),
    setReady: vi.fn().mockResolvedValue(undefined),
    setError: vi.fn().mockResolvedValue(undefined),
    getTranscriptSrt: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("maybeMirrorAfterLink", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("skips covers and unresolved files", async () => {
    const run = vi.fn();
    await maybeMirrorAfterLink({ partId: "CPP-1", kind: "cover", fileId: "file-1", sourceUrl: "https://x", run });
    await maybeMirrorAfterLink({ partId: "CPP-1", kind: "video", fileId: "tg_msg_5", sourceUrl: "https://x", run });
    expect(run).not.toHaveBeenCalled();
  });

  it("skips when no mirror key is configured", async () => {
    vi.stubEnv("VIDS_API_KEY", "");
    const run = vi.fn();
    await maybeMirrorAfterLink({ partId: "CPP-1", kind: "video", fileId: "file-1", sourceUrl: "https://x", run });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the mirror job for video kinds with a key", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const run = vi.fn().mockResolvedValue(undefined);
    await maybeMirrorAfterLink({ partId: "CPP-1", kind: "reel", fileId: "file-1", sourceUrl: "https://x", run });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
