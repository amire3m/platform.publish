import { describe, expect, it, vi, afterEach } from "vitest";

import { reconcileMirrors } from "./reconcile";
import { FakeVidsClient } from "./vids";

describe("reconcileMirrors", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("resumes uploading tasks and processes queued items", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    vi.stubEnv("APP_BASE_URL", "https://app.example");
    const client = new FakeVidsClient();
    // simulate a task that progressed on previous ticks
    const oldTask = await client.remoteUpload("https://example.com/old");
    await client.uploadStatus(oldTask);
    const remoteUpload = vi.spyOn(client, "remoteUpload");
    const store = {
      listPending: vi.fn().mockResolvedValue([
        { id: "M-1", partId: "CPP-1", fileId: "file-a", provider: "vids.st", remoteId: null, remoteTaskId: oldTask, remoteUrl: null, status: "uploading", error: null },
        { id: "M-2", partId: "CPP-2", fileId: "file-b", provider: "vids.st", remoteId: null, remoteTaskId: null, remoteUrl: null, status: "queued", error: null },
      ]),
      setUploading: vi.fn().mockResolvedValue(undefined),
      setReady: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
    };
    const out = await reconcileMirrors({
      client,
      store: store as never,
      maxItems: 5,
      poll: { tries: 2, intervalMs: 0 },
    });
    expect(out.checked).toBe(2);
    expect(out.completed).toBe(2);
    // queued item got a fresh remote upload; old uploading task was polled, not re-uploaded
    expect(remoteUpload).toHaveBeenCalledTimes(1);
    expect(store.setReady).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a mirror key", async () => {
    vi.stubEnv("VIDS_API_KEY", "");
    const store = { listPending: vi.fn() };
    const out = await reconcileMirrors({ store: store as never, client: new FakeVidsClient() });
    expect(out).toEqual({ checked: 0, completed: 0, failed: 0 });
    expect(store.listPending).not.toHaveBeenCalled();
  });
});
