import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

describe("panel group media", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders recent group videos section", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (typeof url === "string" && url.includes("/api/telegram/group-media")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              items: [
                { messageId: "123", fileId: "abc", fileName: "video_123.mp4", mime: "video/mp4", date: new Date().toISOString(), caption: "hi" },
              ],
            },
          }),
        } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/content-room/parts/") && url.includes("/assets")) {
        return {
          ok: true,
          json: async () => ({ ok: true, data: { assets: [] } }),
        } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/channels")) {
        return {
          ok: true,
          json: async () => ({ ok: true, data: { channels: [] } }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({ ok: true, data: {} }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const { ContentRoomDetail } = await import("./ContentRoomDetail");
    const product = {
      id: "p1",
      title: "t1",
      status: "draft",
      productType: "episode",
      channel: "youtube",
      partsCount: 1,
      version: 1,
      notes: null,
      parts: [
        {
          id: "part-1",
          partNumber: 1,
          fileRef: null,
          coverFileRef: null,
          highlightFileRef: null,
          reelFileRef: null,
          playbackUrl: null,
          coverUrl: null,
          highlightUrl: null,
          reelUrl: null,
          isActive: true,
          status: "draft",
          version: 1,
        },
      ],
    } as unknown as never;

    render(<ContentRoomDetail product={product as never} onRefresh={vi.fn()} />);

    // The group-media section lives under the "files" tab; switch to it first
    const filesTab = await screen.findByRole("button", { name: /فایل‌ها/ });
    filesTab.click();

    await waitFor(() => expect(screen.getByText("افزودن فایل از تلگرام (بدون آپلود مجدد ۲ گیگ)")).toBeInTheDocument());
    expect(screen.getAllByText("ویدیو کامل").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/فایل را بکشید یا/).length).toBeGreaterThan(0);

    global.fetch = originalFetch;
  });
});
