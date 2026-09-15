import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ partNumber: 3 }]) }) }),
    })),
  },
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth";
import { getPendingReply } from "@/lib/content-room/pending-link";
import { POST } from "./route";

let userSeq = 0;
function manager(telegramId: string) {
  return { id: `u-${++userSeq}`, role: "manager", telegramId, allowedActions: [], allowedAccountIds: [] };
}

function attachReq(body: unknown): Request {
  return new Request("http://localhost/api/content-room/parts/CPP-1/attach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("attach await_reply session lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("arms the first session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager("tg-lock-1") as never);
    const res = await POST(attachReq({ partId: "CPP-1", kind: "video", mode: "await_reply" }) as never);
    expect(res.status).toBe(200);
    expect(getPendingReply("tg-lock-1")?.partId).toBe("CPP-1");
  });

  it("refreshes re-arm of the same target", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager("tg-lock-2") as never);
    await POST(attachReq({ partId: "CPP-1", kind: "video", mode: "await_reply" }) as never);
    const res = await POST(attachReq({ partId: "CPP-1", kind: "video", mode: "await_reply" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mode).toBe("awaiting");
  });

  it("conflicts when arming a different target (409)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager("tg-lock-3") as never);
    await POST(attachReq({ partId: "CPP-1", kind: "video", mode: "await_reply" }) as never);
    const res = await POST(attachReq({ partId: "CPP-2", kind: "cover", mode: "await_reply" }) as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("SESSION_CONFLICT");
    expect(body.data.session.partId).toBe("CPP-1");
    // original session untouched
    expect(getPendingReply("tg-lock-3")?.partId).toBe("CPP-1");
  });

  it("cancels only on match; mismatch reports current session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(manager("tg-lock-4") as never);
    await POST(attachReq({ partId: "CPP-1", kind: "video", mode: "await_reply" }) as never);
    const mismatch = await POST(attachReq({ partId: "CPP-9", kind: "cover", mode: "cancel" }) as never);
    expect(mismatch.status).toBe(409);
    expect(getPendingReply("tg-lock-4")?.partId).toBe("CPP-1");
    const match = await POST(attachReq({ partId: "CPP-1", kind: "video", mode: "cancel" }) as never);
    expect(match.status).toBe(200);
    expect(getPendingReply("tg-lock-4")).toBeNull();
  });
});
