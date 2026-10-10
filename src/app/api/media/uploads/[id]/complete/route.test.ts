import { describe, expect, it, vi } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleMediaCompleteRequest } from "./route";

describe("POST /api/media/uploads/[id]/complete", () => {
  it("rejects unauthenticated with 401", async () => {
    const requirePermission = vi.fn().mockResolvedValue({
      user: null,
      response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED"),
    });
    const store = { completeSession: vi.fn() };
    const res = await handleMediaCompleteRequest(
      new Request("http://test", { method: "POST" }),
      "MUS-1",
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(401);
    expect(store.completeSession).not.toHaveBeenCalled();
  });

  it("completes a fully-uploaded session with new revision", async () => {
    const requirePermission = vi.fn().mockResolvedValue({ user: { id: "u1" }, response: null });
    const store = {
      completeSession: vi.fn().mockResolvedValue({ assetId: "MAS-1", revisionId: "MRV-1", version: 1, size: 20, sha256: "abc", telegramFileRef: "file-1" }),
    };
    const res = await handleMediaCompleteRequest(
      new Request("http://test", { method: "POST" }),
      "MUS-1",
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.revisionId).toBe("MRV-1");
    expect(body.data.version).toBe(1);
    expect(body.data.telegramFileRef).toBe("file-1");
  });

  it("keeps the session open with 502 when Telegram upload fails", async () => {
    const requirePermission = vi.fn().mockResolvedValue({ user: { id: "u1" }, response: null });
    const err = Object.assign(new Error("telegram down"), { code: "TELEGRAM_UPLOAD_FAILED" });
    const store = { completeSession: vi.fn().mockRejectedValue(err) };
    const res = await handleMediaCompleteRequest(
      new Request("http://test", { method: "POST" }),
      "MUS-1",
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("TELEGRAM_UPLOAD_FAILED");
  });

  it("returns 409 when chunks are missing", async () => {
    const requirePermission = vi.fn().mockResolvedValue({ user: { id: "u1" }, response: null });
    const err = Object.assign(new Error("چانک‌های ناقص"), { code: "INCOMPLETE" });
    const store = { completeSession: vi.fn().mockRejectedValue(err) };
    const res = await handleMediaCompleteRequest(
      new Request("http://test", { method: "POST" }),
      "MUS-1",
      { requirePermission: requirePermission as never, store: store as never },
    );
    expect(res.status).toBe(409);
  });
});
