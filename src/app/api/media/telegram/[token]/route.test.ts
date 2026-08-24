import { describe, expect, it, vi } from "vitest";
import { handleTelegramMediaRequest, type TelegramMediaRouteDependencies } from "./route";

describe("GET /api/media/telegram/:token", () => {
  it("streams media and forwards byte ranges", async () => {
    const downloadFileResponse = vi.fn().mockResolvedValue(
      new Response("chunk", {
        status: 206,
        headers: {
          "content-range": "bytes 10-14/100",
          "content-length": "5",
          "accept-ranges": "bytes",
        },
      }),
    );
    const deps: TelegramMediaRouteDependencies = {
      verifyToken: () => ({ fileId: "file-1", contentType: "video/mp4" }),
      createClient: () => ({ downloadFileResponse }),
    };

    const response = await handleTelegramMediaRequest(
      new Request("http://test/api/media/telegram/token", { headers: { range: "bytes=10-14" } }),
      { params: Promise.resolve({ token: "token" }) },
      deps,
    );

    expect(downloadFileResponse).toHaveBeenCalledWith("file-1", "bytes=10-14");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-range")).toBe("bytes 10-14/100");
    expect(await response.text()).toBe("chunk");
  });

  it("rejects invalid tokens", async () => {
    const response = await handleTelegramMediaRequest(
      new Request("http://test/api/media/telegram/bad"),
      { params: Promise.resolve({ token: "bad" }) },
      {
        verifyToken: () => {
          throw new Error("invalid");
        },
        createClient: vi.fn() as never,
      },
    );

    expect(response.status).toBe(403);
  });
});
