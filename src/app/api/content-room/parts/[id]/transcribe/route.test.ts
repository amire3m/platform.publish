import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/captions/store", () => ({
  dailyMinutesUsed: vi.fn(),
  getPartWithProduct: vi.fn(),
  getTranscriptByPart: vi.fn(),
  saveTranscriptResult: vi.fn(),
  setTranscriptStatus: vi.fn(),
  upsertQueued: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import {
  dailyMinutesUsed,
  getPartWithProduct,
  getTranscriptByPart,
  upsertQueued,
} from "@/lib/captions/store";
import { POST } from "./route";

const MANAGER = { id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] };
const PART = { part: { id: "CPP-1", productId: "CPR-1", partNumber: 1, fileRef: "tg_msg_5" }, product: { id: "CPR-1", title: "t", channel: "c" } };

function req(): Request {
  return new Request("http://localhost/api/content-room/parts/CPP-1/transcribe", { method: "POST" }) as never;
}

describe("POST transcribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated (401)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(401);
  });

  it("rejects viewers without edit permission (403)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", role: "viewer", allowedActions: [], allowedAccountIds: [] } as never);
    const res = await POST(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 for missing part", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getPartWithProduct).mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("enqueues new jobs with 202 envelope", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getPartWithProduct).mockResolvedValue(PART as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue(null);
    vi.mocked(dailyMinutesUsed).mockResolvedValue(0);
    vi.mocked(upsertQueued).mockResolvedValue({ id: "PTR-1", status: "queued" } as never);
    const res = await POST(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { status: "queued" } });
    expect(upsertQueued).toHaveBeenCalledWith("CPP-1");
  });

  it("does not duplicate running jobs", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getPartWithProduct).mockResolvedValue(PART as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue({ status: "processing" } as never);
    const res = await POST(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(202);
    expect(upsertQueued).not.toHaveBeenCalled();
  });

  it("enforces the daily cap (429)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getPartWithProduct).mockResolvedValue(PART as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue(null);
    vi.mocked(dailyMinutesUsed).mockResolvedValue(10000);
    const res = await POST(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(429);
    expect(upsertQueued).not.toHaveBeenCalled();
  });
});
