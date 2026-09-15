import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/telegram/client", () => ({
  TelegramClient: { fromEnv: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] }),
}));

import { TelegramClient } from "@/lib/telegram/client";
import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/media/warm", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "session=x" },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/media/warm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("warms the cache by downloading the file", async () => {
    const downloadFile = vi.fn().mockResolvedValue(Buffer.from("bytes"));
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValue({ downloadFile } as never);
    const res = await POST(req({ fileId: "file-1" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { warmed: true } });
    expect(downloadFile).toHaveBeenCalledWith("file-1");
  });

  it("rejects missing fileId (422)", async () => {
    const res = await POST(req({}) as never);
    expect(res.status).toBe(422);
  });

  it("maps download failures to 502", async () => {
    const downloadFile = vi.fn().mockRejectedValue(new Error("boom"));
    vi.mocked(TelegramClient.fromEnv as unknown as () => unknown).mockReturnValue({ downloadFile } as never);
    const res = await POST(req({ fileId: "file-1" }) as never);
    expect(res.status).toBe(502);
  });
});
