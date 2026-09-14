import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/captions/store", () => ({
  getPartWithProduct: vi.fn(),
  getTranscriptByPart: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { getPartWithProduct, getTranscriptByPart } from "@/lib/captions/store";
import { GET } from "./route";

const MANAGER = { id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] };
const PART = { part: { id: "CPP-1", productId: "CPR-1", partNumber: 3, fileRef: "f" }, product: { id: "CPR-1", title: "t", channel: "c" } };

function req(): Request {
  return new Request("http://localhost/api/content-room/parts/CPP-1/subtitle") as never;
}

describe("GET subtitle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated (401)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when no subtitle exists", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getPartWithProduct).mockResolvedValue(PART as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue({ srtText: "" } as never);
    const res = await GET(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(404);
  });

  it("downloads SRT as attachment", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getPartWithProduct).mockResolvedValue(PART as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue({ srtText: "1\n00:00:00,000 --> 00:00:02,000\ntest\n" } as never);
    const res = await GET(req(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("Content-Disposition")).toContain("part-3.srt");
    expect(await res.text()).toContain("00:00:00,000");
  });
});
