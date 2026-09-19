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
      discoverUnmirrored: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn().mockResolvedValue(undefined),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([]),
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
    expect(out).toEqual({ checked: 0, completed: 0, failed: 0, enqueued: 0, requeued: 0 });
    expect(store.listPending).not.toHaveBeenCalled();
  });

  it("enqueues discovered unmirrored files", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const client = new FakeVidsClient();
    const store = {
      listPending: vi.fn().mockResolvedValue([]),
      setUploading: vi.fn().mockResolvedValue(undefined),
      setReady: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
      discoverUnmirrored: vi.fn().mockResolvedValue([{ partId: "CPP-9", fileId: "file-old" }]),
      enqueue: vi.fn().mockResolvedValue(undefined),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([]),
    };
    const out = await reconcileMirrors({ client, store: store as never, maxItems: 5, poll: { tries: 1, intervalMs: 0 } });
    expect(store.enqueue).toHaveBeenCalledWith("CPP-9", "file-old");
    expect(out.enqueued).toBe(1);
  });

  it("refreshes missing playback links of ready rows", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const client = new FakeVidsClient();
    const taskId = await client.remoteUpload("https://example.com/v.mp4");
    await client.uploadStatus(taskId);
    await client.uploadStatus(taskId);
    const store = {
      listPending: vi.fn().mockResolvedValue([]),
      setUploading: vi.fn(),
      setReady: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn(),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
      discoverUnmirrored: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn(),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([
        { id: "M-7", partId: "CPP-7", fileId: "file-g", provider: "vids.st", remoteId: `F-fake-${taskId}`, remoteTaskId: taskId, remoteUrl: null, status: "ready", error: null },
      ]),
    };
    const out = await reconcileMirrors({ client, store: store as never });
    expect(store.setReady).toHaveBeenCalledWith("file-g", expect.any(String), expect.stringContaining("https://cdn.fake/"));
    expect(out.completed).toBe(1);
  });

  it("requeues uploading rows whose remote task is gone instead of leaving them stuck", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const client = new FakeVidsClient();
    const store = {
      listPending: vi.fn().mockResolvedValue([
        { id: "M-9", partId: "CPP-9", fileId: "file-gone", provider: "vids.st", remoteId: null, remoteTaskId: "T-unknown", remoteUrl: null, status: "uploading", error: null },
      ]),
      setUploading: vi.fn(),
      setReady: vi.fn(),
      setError: vi.fn(),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
      discoverUnmirrored: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn().mockResolvedValue(undefined),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([]),
      requeueStale: vi.fn().mockResolvedValue(0),
    };
    const out = await reconcileMirrors({ client, store: store as never, maxItems: 5, poll: { tries: 1, intervalMs: 0 } });
    expect(store.enqueue).toHaveBeenCalledWith("CPP-9", "file-gone");
    expect(store.setError).not.toHaveBeenCalled();
    expect(store.setReady).not.toHaveBeenCalled();
    expect(out.requeued).toBe(1);
  });
});
