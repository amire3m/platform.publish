import { describe, expect, it, vi } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleMediaChunkRequest } from "./route";

describe("PUT /api/media/uploads/[id]/chunks", () => {
  it("rejects unauthenticated with 401", async () => {
    const requirePermission = vi.fn().mockResolvedValue({
      user: null,
      response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED"),
    });
    const store = { getSession: vi.fn(), appendChunk: vi.fn() };
    const res = await handleMediaChunkRequest(
      new Request("http://test?index=0", { method: "PUT", body: new Uint8Array([1]) }),
      "MUS-1",
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(401);
    expect(store.getSession).not.toHaveBeenCalled();
  });

  it("stores a valid chunk and returns received count", async () => {
    const requirePermission = vi.fn().mockResolvedValue({ user: { id: "u1" }, response: null });
    const store = {
      getSession: vi.fn().mockResolvedValue({ id: "MUS-1", totalChunks: 2, chunkBytes: 8, receivedChunks: [0], status: "open" }),
      appendChunk: vi.fn().mockResolvedValue({ received: [0, 1] }),
    };
    const res = await handleMediaChunkRequest(
      new Request("http://test?index=1", { method: "PUT", body: new Uint8Array([9, 9]) }),
      "MUS-1",
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.received).toEqual([0, 1]);
  });

  it("rejects out-of-range index", async () => {
    const requirePermission = vi.fn().mockResolvedValue({ user: { id: "u1" }, response: null });
    const store = {
      getSession: vi.fn().mockResolvedValue({ id: "MUS-1", totalChunks: 2, chunkBytes: 8, receivedChunks: [], status: "open" }),
      appendChunk: vi.fn(),
    };
    const res = await handleMediaChunkRequest(
      new Request("http://test?index=7", { method: "PUT", body: new Uint8Array([1]) }),
      "MUS-1",
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(422);
    expect(store.appendChunk).not.toHaveBeenCalled();
  });
});
