import { describe, expect, it, vi } from "vitest";
import { uploadFileResumable } from "./chunked-upload-client";

function fakeFile(size: number, chunkBytes: number) {
  return {
    size,
    slice: (start: number, end: number) => ({
      arrayBuffer: async () => new Uint8Array(Math.max(0, Math.min(end, size) - start)).buffer as ArrayBuffer,
    }),
    name: "p1.mp4",
    type: "video/mp4",
    chunkBytes,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: status < 400, data }), { status });
}

describe("uploadFileResumable", () => {
  it("creates a session, uploads all chunks, then completes", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "/api/media/uploads") return jsonResponse({ sessionId: "MUS-1", totalChunks: 3, chunkBytes: 8 }, 201);
      if (url.includes("/chunks")) return jsonResponse({ received: [0] });
      if (url.includes("/complete")) return jsonResponse({ assetId: "MAS-1", revisionId: "MRV-1", version: 1 });
      throw new Error("unexpected " + url);
    });
    const out = await uploadFileResumable(fakeFile(20, 8) as never, {}, { fetchFn: fetchFn as never });
    expect(out.revisionId).toBe("MRV-1");
    expect(fetchFn).toHaveBeenCalledTimes(1 + 3 + 1);
    expect(calls.filter((c) => c.includes("/chunks"))).toHaveLength(3);
  });

  it("retries a failed chunk and reports progress", async () => {
    const progress: number[] = [];
    let chunkAttempts = 0;
    const fetchFn = vi.fn(async (url: string): Promise<Response> => {
      if (url === "/api/media/uploads") return jsonResponse({ sessionId: "MUS-2", totalChunks: 1, chunkBytes: 8 }, 201);
      if (url.includes("/chunks")) {
        chunkAttempts++;
        if (chunkAttempts === 1) return jsonResponse({ error: "boom" }, 500);
        return jsonResponse({ received: [0] });
      }
      return jsonResponse({ assetId: "MAS-2", revisionId: "MRV-2", version: 1 });
    });
    const out = await uploadFileResumable(fakeFile(5, 8) as never, {}, {
      fetchFn: fetchFn as never,
      onProgress: (p) => progress.push(p.sentChunks),
    });
    expect(out.revisionId).toBe("MRV-2");
    expect(chunkAttempts).toBe(2);
    expect(progress.length).toBeGreaterThan(0);
  });
});
