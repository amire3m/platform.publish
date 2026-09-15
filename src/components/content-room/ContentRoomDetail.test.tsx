import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

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

  it("shows transcript panel with transcribe action on part cards", async () => {
    const originalFetch = global.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      calls.push({ url, init });
      if (typeof url === "string" && url.includes("/transcript")) {
        return { ok: true, json: async () => ({ ok: true, data: { status: "none" } }) } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/transcribe")) {
        return { ok: true, json: async () => ({ ok: true, data: { status: "queued" } }) } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/channels")) {
        return { ok: true, json: async () => ({ ok: true, data: { channels: [] } }) } as unknown as Response;
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
          fileRef: "tg-file-1",
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

    const filesTab = await screen.findByRole("button", { name: /فایل‌ها/ });
    filesTab.click();

    const transcribeBtn = await screen.findByRole("button", { name: "رونویسی" });
    transcribeBtn.click();

    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/transcribe") && c.init?.method === "POST")).toBe(true);
    });

    global.fetch = originalFetch;
  });

  it("opens channel link dialog and saves youtube linkage", async () => {
    const originalFetch = global.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      calls.push({ url, init });
      if (typeof url === "string" && url.includes("/api/channels") && init?.method === "PATCH") {
        return { ok: true, json: async () => ({ ok: true, data: { channel: {} } }) } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/channels")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: { channels: [{ id: "youtube", labelFa: "Y", youtubeAccountId: null, instagramAccountId: null, telegramTopicId: null }] },
          }),
        } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/accounts")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: [{ id: "acc-yt", platform: "youtube", displayName: "YT", username: "yt", active: true, connectionStatus: "connected" }],
          }),
        } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/telegram/topics")) {
        return { ok: true, json: async () => ({ ok: true, data: [] }) } as unknown as Response;
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
      parts: [],
    } as unknown as never;

    render(<ContentRoomDetail product={product as never} onRefresh={vi.fn()} />);

    const connectBtns = await screen.findAllByRole("button", { name: /اتصال/ });
    connectBtns[0].click();

    const ytSelect = await screen.findByLabelText("حساب یوتیوب");
    fireEvent.change(ytSelect, { target: { value: "acc-yt" } });

    const saveBtn = await screen.findByRole("button", { name: "ذخیره" });
    saveBtn.click();

    await waitFor(() => {
      const patch = calls.find((c) => c.url.includes("/api/channels") && c.init?.method === "PATCH");
      expect(patch).toBeDefined();
      expect(String(patch!.init!.body)).toContain("acc-yt");
    });

    global.fetch = originalFetch;
  });

  it("warns when a pasted link resolves without a direct file", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (typeof url === "string" && url.includes("/attach") && init?.method === "POST") {
        return { ok: true, json: async () => ({ ok: true, data: { mode: "linked", storedRef: "tg_msg_9", resolved: false } }) } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/channels")) {
        return { ok: true, json: async () => ({ ok: true, data: { channels: [] } }) } as unknown as Response;
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

    const filesTab = await screen.findByRole("button", { name: /فایل‌ها/ });
    filesTab.click();

    const videoBtn = await screen.findByRole("button", { name: "ویدیو کامل" });
    videoBtn.click();

    const input = await screen.findByPlaceholderText("https://t.me/c/2326782937/2577");
    fireEvent.change(input, { target: { value: "https://t.me/emamyt/28/1081" } });

    const linkBtn = await screen.findByRole("button", { name: "لینک کن" });
    linkBtn.click();

    await waitFor(() => expect(screen.getByText(/فایل مستقیم از تلگرام خوانده نشد/)).toBeInTheDocument());

    global.fetch = originalFetch;
  });

  it("offers video prepare after player failure and warms the file", async () => {
    const originalFetch = global.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      calls.push({ url, init });
      if (typeof url === "string" && url.includes("/api/media/warm")) {
        return { ok: true, json: async () => ({ ok: true, data: { warmed: true } }) } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("/api/channels")) {
        return { ok: true, json: async () => ({ ok: true, data: { channels: [] } }) } as unknown as Response;
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
          fileRef: "file-abc",
          coverFileRef: null,
          highlightFileRef: null,
          reelFileRef: null,
          playbackUrl: "https://example.com/v.mp4",
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

    const filesTab = await screen.findByRole("button", { name: /فایل‌ها/ });
    filesTab.click();

    await screen.findByText("قسمت 1");
    fireEvent.error(document.querySelector("video")!);
    const prepareBtn = await screen.findByRole("button", { name: "آماده‌سازی ویدیو" });
    prepareBtn.click();

    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/api/media/warm") && c.init?.method === "POST")).toBe(true);
    });

    global.fetch = originalFetch;
  });
});
