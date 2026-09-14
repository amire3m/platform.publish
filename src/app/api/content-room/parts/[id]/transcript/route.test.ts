import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/captions/store", () => ({
  getTranscriptByPart: vi.fn(),
  saveEditedText: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { getTranscriptByPart, saveEditedText } from "@/lib/captions/store";
import { GET, PATCH } from "./route";

const MANAGER = { id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] };
const ROW = {
  id: "PTR-1",
  status: "ready",
  fullText: "hello world test",
  segments: [{ start: 0, end: 10, text: "hello world test" }],
  srtText: "srt",
  captions: null,
  version: 2,
  error: null,
  sttModel: "fake",
  llmModel: null,
  durationSec: 10,
};

function getReq(): Request {
  return new Request("http://localhost/api/content-room/parts/CPP-1/transcript") as never;
}

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/content-room/parts/CPP-1/transcript", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("transcript route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects GET unauthenticated (401)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns status none when never transcribed", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue(null);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { status: "none" } });
  });

  it("returns stored transcript data", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue(ROW as never);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "CPP-1" }) });
    const body = await res.json();
    expect(body.data.text).toBe("hello world test");
    expect(body.data.version).toBe(2);
  });

  it("rejects PATCH without version (422)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    const res = await PATCH(patchReq({ text: "x" }), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(422);
    expect(saveEditedText).not.toHaveBeenCalled();
  });

  it("maps version conflicts to 409", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue(ROW as never);
    vi.mocked(saveEditedText).mockRejectedValue(Object.assign(new Error("old"), { code: "VERSION_CONFLICT" }));
    const res = await PATCH(patchReq({ text: "new text here", expectedVersion: 1 }), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(409);
  });

  it("saves edited text with regenerated SRT", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MANAGER as never);
    vi.mocked(getTranscriptByPart).mockResolvedValue(ROW as never);
    vi.mocked(saveEditedText).mockResolvedValue({ fullText: "new text here", srtText: "1\n00:00:00,000 --> 00:00:10,000\nnew text here\n", version: 3 } as never);
    const res = await PATCH(patchReq({ text: "new text here", expectedVersion: 2 }), { params: Promise.resolve({ id: "CPP-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.version).toBe(3);
    expect(saveEditedText).toHaveBeenCalledWith("CPP-1", "new text here", expect.stringContaining("new text here"), 2);
  });
});
