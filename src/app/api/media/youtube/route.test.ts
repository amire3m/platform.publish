import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockGet360pUrl = vi.hoisted(() => vi.fn().mockResolvedValue("http://example.com/360.mp4"));
vi.mock("@/lib/youtube/proxy", () => ({ get360pUrl: mockGet360pUrl }));

const mockRequirePermission = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ user: { id: "u1", role: "owner" } as unknown as never, response: null } as never),
);
vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return { ...actual, requirePermission: mockRequirePermission };
});

import { GET } from "./[videoId]/route";

const VALID_ID = "dQw4w9WgXcQ"; // 11 chars matches regex

describe("GET /api/media/youtube/[videoId]", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet360pUrl.mockResolvedValue("http://example.com/360.mp4");
    mockRequirePermission.mockResolvedValue({ user: { id: "u1", role: "owner" } as never, response: null } as never);
    // default upstream mock: 200 OK
    global.fetch = vi.fn().mockResolvedValue(
      new Response("fake-body", {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "9",
          "accept-ranges": "bytes",
        },
      }),
    ) as never;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns 206 for Range and forwards Range header", async () => {
    // upstream should return 206 when Range is sent
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string> | undefined)?.Range ?? (init?.headers as Headers | undefined)?.get?.("Range");
      if (range) {
        return new Response("fa", {
          status: 206,
          headers: {
            "content-type": "video/mp4",
            "content-length": "2",
            "content-range": "bytes 0-1/9",
            "accept-ranges": "bytes",
          },
        });
      }
      return new Response("fake-body", {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "9" },
      });
    }) as never;

    const req = new Request(`http://localhost/api/media/youtube/${VALID_ID}`, {
      headers: { Range: "bytes=0-1" },
    });
    const res = await GET(req, { params: Promise.resolve({ videoId: VALID_ID }) });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-1/9");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(mockGet360pUrl).toHaveBeenCalledWith(VALID_ID);
    expect(global.fetch).toHaveBeenCalledWith("http://example.com/360.mp4", { headers: { Range: "bytes=0-1" } });
  });

  it("returns 200 when no Range header", async () => {
    const req = new Request(`http://localhost/api/media/youtube/${VALID_ID}`);
    const res = await GET(req, { params: Promise.resolve({ videoId: VALID_ID }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(global.fetch).toHaveBeenCalledWith("http://example.com/360.mp4", undefined);
  });

  it("returns 400 for invalid videoId", async () => {
    const req = new Request("http://localhost/api/media/youtube/abc");
    const res = await GET(req, { params: Promise.resolve({ videoId: "abc" }) });
    expect(res.status).toBe(400);
    expect(mockGet360pUrl).not.toHaveBeenCalled();
  });

  it("returns 404 when ytdl throws", async () => {
    mockGet360pUrl.mockRejectedValue(new Error("Video unavailable"));
    const req = new Request(`http://localhost/api/media/youtube/${VALID_ID}`);
    const res = await GET(req, { params: Promise.resolve({ videoId: VALID_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 502 when no 360p format available", async () => {
    mockGet360pUrl.mockRejectedValue(new Error("360p not found"));
    const req = new Request(`http://localhost/api/media/youtube/${VALID_ID}`);
    const res = await GET(req, { params: Promise.resolve({ videoId: VALID_ID }) });
    expect(res.status).toBe(502);
  });

  it("returns 404 when upstream not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("not found", { status: 404 })) as never;
    const req = new Request(`http://localhost/api/media/youtube/${VALID_ID}`);
    const res = await GET(req, { params: Promise.resolve({ videoId: VALID_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when requirePermission denies", async () => {
    const { jsonError } = await import("@/lib/api-helpers");
    mockRequirePermission.mockResolvedValue({
      user: null,
      response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN"),
    } as never);
    const req = new Request(`http://localhost/api/media/youtube/${VALID_ID}`);
    const res = await GET(req, { params: Promise.resolve({ videoId: VALID_ID }) });
    expect(res.status).toBe(403);
  });
});
