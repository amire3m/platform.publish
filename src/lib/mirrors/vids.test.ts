import { describe, expect, it, vi, afterEach } from "vitest";

import { FakeVidsClient, VidsClient } from "./vids";

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  const mock = vi.fn().mockResolvedValue({ ok, status, json: async () => payload });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("VidsClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("queues remote uploads and returns task id", async () => {
    const fetchMock = mockFetchOnce({ status: 200, result: { task_id: "T-1" } });
    const client = new VidsClient("https://vids.st/api/index.php", "key");
    const taskId = await client.remoteUpload("https://example.com/v.mp4");
    expect(taskId).toBe("T-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: FormData }];
    expect(url).toContain("action=upload%2Furl");
    expect(init.method).toBe("POST");
    expect(init.body.get("url")).toBe("https://example.com/v.mp4");
  });

  it("reads remote-upload status", async () => {
    mockFetchOnce({ status: 200, result: { status: "done", file_id: "F-9" } });
    const client = new VidsClient("https://vids.st/api/index.php", "key");
    const s = await client.uploadStatus("T-1");
    expect(s.status).toBe("done");
    expect(s.file_id).toBe("F-9");
  });

  it("reads file links and deletes files", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 200, result: { links: { stream: "https://cdn/u.mp4" } } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 200, result: { deleted: true } }) });
    vi.stubGlobal("fetch", fetchMock);
    const client = new VidsClient("https://vids.st/api/index.php", "key");
    const info = await client.fileInfo("F-9");
    expect(info.streamUrl).toContain("https://cdn/u.mp4");
    await client.deleteFile("F-9");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws precise errors on API failure", async () => {
    mockFetchOnce({ status: 403, message: "denied" }, false, 403);
    const client = new VidsClient("https://vids.st/api/index.php", "key");
    await expect(client.remoteUpload("https://example.com/v.mp4")).rejects.toThrow("denied");
  });

  it("fake client completes tasks without network", async () => {
    const fake = new FakeVidsClient();
    const taskId = await fake.remoteUpload("https://example.com/v.mp4");
    await fake.uploadStatus(taskId);
    const done = await fake.uploadStatus(taskId);
    expect(done.status).toBe("done");
    expect(done.file_id).toBeDefined();
  });
});
