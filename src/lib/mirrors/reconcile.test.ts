import { describe, expect, it, vi, afterEach } from "vitest";

import { reconcileMirrors } from "./reconcile";
import { FakeVidsClient, VidsApiError } from "./vids";

describe("reconcileMirrors", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("resumes uploading tasks and processes queued items", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    vi.stubEnv("APP_BASE_URL", "https://app.example");
    vi.stubEnv("JWT_SECRET", "test-secret");
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
      setSubmitting: vi.fn().mockResolvedValue(true),
      setUploading: vi.fn().mockResolvedValue(true),
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
    expect(out).toMatchObject({ checked: 0, completed: 0, failed: 0, enqueued: 0, requeued: 0 });
    expect(store.listPending).not.toHaveBeenCalled();
  });

  it("enqueues discovered unmirrored files", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const client = new FakeVidsClient();
    const store = {
      listPending: vi.fn().mockResolvedValue([]),
      setUploading: vi.fn().mockResolvedValue(true),
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
      setUploading: vi.fn().mockResolvedValue(true),
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
      setSubmitting: vi.fn().mockResolvedValue(true),
      setUploading: vi.fn().mockResolvedValue(true),
      setReady: vi.fn(),
      setError: vi.fn(),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
      discoverUnmirrored: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn().mockResolvedValue(undefined),
      requeueMissing: vi.fn().mockResolvedValue(undefined),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([]),
      requeueStale: vi.fn().mockResolvedValue(0),
    };
    const out = await reconcileMirrors({ client, store: store as never, maxItems: 5, poll: { tries: 1, intervalMs: 0 } });
    expect(store.requeueMissing).toHaveBeenCalledWith("file-gone", "T-unknown");
    expect(store.setError).not.toHaveBeenCalled();
    expect(store.setReady).not.toHaveBeenCalled();
    expect(out.requeued).toBe(1);
  });

  it("keeps an uploading row when a transport-level 404 does not prove the task is gone", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const client = new FakeVidsClient();
    const error = Object.assign(new VidsApiError("proxy route missing", "upload/status", 404), { fromApiPayload: false });
    vi.spyOn(client, "uploadStatus").mockRejectedValue(error);
    const store = {
      listPending: vi.fn().mockResolvedValue([
        { id: "M-HTTP-404", partId: "CPP-9", fileId: "file-live", provider: "vids.st", remoteId: null, remoteTaskId: "T-live", remoteUrl: null, status: "uploading", error: null },
      ]),
      setSubmitting: vi.fn(),
      setUploading: vi.fn(),
      setClaimError: vi.fn(),
      setReady: vi.fn(),
      setError: vi.fn(),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
      discoverUnmirrored: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn(),
      requeueMissing: vi.fn(),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([]),
    };

    const out = await reconcileMirrors({ client, store: store as never });

    expect(store.requeueMissing).not.toHaveBeenCalled();
    expect(out.requeued).toBe(0);
  });

  it("keeps uploading rows intact when status polling fails transiently", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const client = new FakeVidsClient();
    vi.spyOn(client, "uploadStatus").mockRejectedValue(new VidsApiError("temporary outage", "upload/status", 503));
    const store = {
      listPending: vi.fn().mockResolvedValue([
        { id: "M-10", partId: "CPP-10", fileId: "file-live", provider: "vids.st", remoteId: null, remoteTaskId: "T-live", remoteUrl: null, status: "uploading", error: null },
      ]),
      setUploading: vi.fn().mockResolvedValue(true),
      setReady: vi.fn(),
      setError: vi.fn(),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
      discoverUnmirrored: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn().mockResolvedValue(undefined),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([]),
      requeueStale: vi.fn().mockResolvedValue(1),
    };

    const out = await reconcileMirrors({ client, store: store as never, maxItems: 5, poll: { tries: 1, intervalMs: 0 } });

    expect(store.requeueStale).not.toHaveBeenCalled();
    expect(store.enqueue).not.toHaveBeenCalled();
    expect(store.setError).not.toHaveBeenCalled();
    expect(out.requeued).toBe(0);
  });

  it("checks provider capacity once and reports why queued files are blocked", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const client = new FakeVidsClient();
    const serverCapacity = vi.spyOn(client, "serverCapacity").mockResolvedValue({
      active_remote: 1,
      queued_remote: 56,
      free_remote: 0,
      max_remote: 1,
      max_concurrent: 1,
    });
    const remoteUpload = vi.spyOn(client, "remoteUpload");
    const store = {
      listPending: vi.fn().mockResolvedValue([
        { id: "M-11", partId: "CPP-11", fileId: "file-11", provider: "vids.st", remoteId: null, remoteTaskId: null, remoteUrl: null, status: "queued", error: null },
        { id: "M-12", partId: "CPP-12", fileId: "file-12", provider: "vids.st", remoteId: null, remoteTaskId: null, remoteUrl: null, status: "queued", error: null },
      ]),
      setUploading: vi.fn(),
      setReady: vi.fn(),
      setError: vi.fn(),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
      discoverUnmirrored: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn().mockResolvedValue(undefined),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([]),
    };

    const out = await reconcileMirrors({ client, store: store as never, maxItems: 5, poll: { tries: 1, intervalMs: 0 } });

    expect(serverCapacity).toHaveBeenCalledTimes(1);
    expect(remoteUpload).not.toHaveBeenCalled();
    expect(out).toMatchObject({ blocked: 2, capacity: { free_remote: 0, queued_remote: 56 } });
  });

  it("does not let long-running uploads starve a queued file when capacity is free", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    vi.stubEnv("APP_BASE_URL", "https://app.example");
    vi.stubEnv("JWT_SECRET", "test-secret");
    const client = new FakeVidsClient();
    const activeTasks = await Promise.all([
      client.remoteUpload("https://example.com/1"),
      client.remoteUpload("https://example.com/2"),
    ]);
    const remoteUpload = vi.spyOn(client, "remoteUpload");
    vi.spyOn(client, "serverCapacity").mockResolvedValue({ active_remote: 0, queued_remote: 0, free_remote: 1, max_remote: 1, max_concurrent: 1 });
    const store = {
      listPending: vi.fn().mockResolvedValue([
        ...activeTasks.map((taskId, index) => ({ id: `M-${index}`, partId: `CPP-${index}`, fileId: `file-${index}`, provider: "vids.st", remoteId: null, remoteTaskId: taskId, remoteUrl: null, status: "uploading", error: null })),
        { id: "M-Q", partId: "CPP-Q", fileId: "file-queued", provider: "vids.st", remoteId: null, remoteTaskId: null, remoteUrl: null, status: "queued", error: null },
      ]),
      setSubmitting: vi.fn().mockResolvedValue(true),
      setUploading: vi.fn().mockResolvedValue(true),
      setReady: vi.fn(),
      setError: vi.fn(),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
      discoverUnmirrored: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn(),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([]),
    };

    await reconcileMirrors({ client, store: store as never, maxItems: 2, poll: { tries: 1, intervalMs: 0 } });

    expect(remoteUpload).toHaveBeenCalledTimes(1);
    expect(store.setUploading).toHaveBeenCalledWith("file-queued", expect.any(String), expect.any(String));
  });

  it("does no work when another process owns the reconcile lock", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const store = { listPending: vi.fn() };

    const out = await reconcileMirrors({
      client: new FakeVidsClient(),
      store: store as never,
      withLock: vi.fn().mockResolvedValue(null),
    });

    expect(store.listPending).not.toHaveBeenCalled();
    expect(out).toMatchObject({ checked: 0, blocked: 0 });
  });

  it("fails safely when the reconcile lock cannot be acquired", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");

    await expect(reconcileMirrors({
      client: new FakeVidsClient(),
      store: { listPending: vi.fn() } as never,
      withLock: vi.fn().mockRejectedValue(new Error("database unavailable")),
    })).resolves.toMatchObject({ checked: 0, failed: 0, blocked: 0 });
  });

  it("never polls or resubmits an uncertain pre-submit claim automatically", async () => {
    vi.stubEnv("VIDS_API_KEY", "test-key");
    const client = new FakeVidsClient();
    const uploadStatus = vi.spyOn(client, "uploadStatus");
    const remoteUpload = vi.spyOn(client, "remoteUpload");
    const store = {
      listPending: vi.fn().mockResolvedValue([
        { id: "M-C", partId: "CPP-C", fileId: "file-claimed", provider: "vids.st", remoteId: null, remoteTaskId: "submitting:claim-1", remoteUrl: null, status: "uploading", error: "awaiting confirmation" },
      ]),
      setSubmitting: vi.fn(),
      setUploading: vi.fn(),
      setReady: vi.fn(),
      setError: vi.fn(),
      getTranscriptSrt: vi.fn().mockResolvedValue(null),
      discoverUnmirrored: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn(),
      requeueMissing: vi.fn(),
      listReadyWithoutUrl: vi.fn().mockResolvedValue([]),
    };

    await reconcileMirrors({ client, store: store as never });

    expect(uploadStatus).not.toHaveBeenCalled();
    expect(remoteUpload).not.toHaveBeenCalled();
    expect(store.requeueMissing).not.toHaveBeenCalled();
  });
});
