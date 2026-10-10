import { describe, expect, it, vi } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleMediaUploadsRequest } from "./route";

describe("POST /api/media/uploads", () => {
  it("rejects unauthenticated with 401", async () => {
    const requirePermission = vi.fn().mockResolvedValue({
      user: null,
      response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED"),
    });
    const store = { createSession: vi.fn() };
    const res = await handleMediaUploadsRequest(
      new Request("http://test/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({ fileName: "a.mp4", mime: "video/mp4", totalBytes: 10 }),
      }),
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(401);
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it("creates a session for valid input", async () => {
    const requirePermission = vi.fn().mockResolvedValue({ user: { id: "u1" }, response: null });
    const store = {
      createSession: vi.fn().mockResolvedValue({ id: "MUS-1", totalChunks: 1, chunkBytes: 8388608 }),
    };
    const res = await handleMediaUploadsRequest(
      new Request("http://test/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({ fileName: "a.mp4", mime: "video/mp4", totalBytes: 10 }),
      }),
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.sessionId).toBe("MUS-1");
    expect(store.createSession).toHaveBeenCalledOnce();
  });

  it("rejects oversize payloads over 8GB", async () => {
    const requirePermission = vi.fn().mockResolvedValue({ user: { id: "u1" }, response: null });
    const store = { createSession: vi.fn() };
    const res = await handleMediaUploadsRequest(
      new Request("http://test/api/media/uploads", {
        method: "POST",
        body: JSON.stringify({ fileName: "big.mp4", mime: "video/mp4", totalBytes: 9 * 1024 * 1024 * 1024 }),
      }),
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(422);
    expect(store.createSession).not.toHaveBeenCalled();
  });
});
