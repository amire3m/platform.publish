import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/captions/store", () => ({
  getPartWithProduct: vi.fn(),
  getTranscriptByPart: vi.fn(),
  saveCaptions: vi.fn(),
}));
vi.mock("@/lib/captions/providers", () => ({
  getProviders: vi.fn(() => ({
    captions: { generate: vi.fn().mockResolvedValue({ youtube: "yt", instagram: "ig", model: "fake" }) },
  })),
}));

import { getCurrentUser } from "@/lib/auth";
import { getPartWithProduct, getTranscriptByPart, saveCaptions } from "@/lib/captions/store";
import { POST } from "./route";

const MANAGER = { id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] };
const PART = { part: { id: "CPP-1", productId: "CPR-1", partNumber: 1, fileRef: "f" }, product: { id: "CPR-1", title: "t", channel: "c" } };
const ROW = { fullText: "some transcript text here" };

function req(): Request {
  return new Request("http://localhost/api/content-room/parts/CPP-1/captions", { method: "POST" }) as never;
}

describe("POST captions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated (401)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing part", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getPartWithProduct).mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("requires a transcript first (422)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getPartWithProduct).mockResolvedValue(PART as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue({ fullText: "   " } as never);
    const res = await POST(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(422);
    expect(saveCaptions).not.toHaveBeenCalled();
  });

  it("generates and persists captions in envelope", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getPartWithProduct).mockResolvedValue(PART as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue(ROW as never);
    const res = await POST(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { youtube: "yt", instagram: "ig" } });
    expect(saveCaptions).toHaveBeenCalledWith("CPP-1", { youtube: "yt", instagram: "ig" }, "fake");
  });
});
