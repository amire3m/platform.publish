import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

import { FilePreview } from "./page";

describe("FilePreview prepare flow", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/media/warm")) {
        return { ok: true, json: async () => ({ ok: true, data: { warmed: true } }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ ok: true, data: {} }) } as unknown as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("offers prepare-to-play after a failure, then refreshes and retries", async () => {
    const onRefresh = vi.fn();
    render(
      <FilePreview
        item={{ id: "f1", filename: "v.mp4", type: "full_video", playbackUrl: "https://example.com/v.mp4", createdAt: new Date().toISOString(), fileId: "file-1" } as never}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.error(document.querySelector("video")!);
    const prepareBtn = await screen.findByRole("button", { name: /آماده‌سازی/ });
    prepareBtn.click();
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/media/warm",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("file-1") }),
    );
    // player mounted again after refresh
    await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  });
});
