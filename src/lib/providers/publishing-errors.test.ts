import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const videosInsert = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    youtube: () => ({
      videos: { insert: videosInsert },
      thumbnails: { set: vi.fn() },
    }),
  },
}));

import { youtubeProvider } from "./youtube";
import { instagramProvider } from "./instagram";
import type { PublishInput } from "./types";

const input: PublishInput = {
  accountExternalId: "account-1",
  credentialPayload: { accessToken: "token", igUserId: "ig-1" },
  fileBuffer: Buffer.from("video"),
  fileName: "video.mp4",
  mimeType: "video/mp4",
  contentType: "image",
};

describe("publishing provider errors", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.META_APP_ID = "app";
    process.env.META_APP_SECRET = "secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    videosInsert.mockReset();
  });

  it("returns a safe Persian YouTube failure while preserving raw-message retryability", async () => {
    const rawError = new Error("quota exceeded: provider secret");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    videosInsert.mockRejectedValue(rawError);

    const result = await youtubeProvider.publish(input);

    expect(result).toEqual({
      ok: false,
      errorCode: "YOUTUBE_API_ERROR",
      message: "انتشار در YouTube انجام نشد. دوباره تلاش کنید.",
      retryable: true,
    });
    expect(consoleError).toHaveBeenCalledWith("[youtube-provider] publish failed:", rawError);
  });

  it("returns a safe Persian Instagram failure while preserving raw-message retryability", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: vi.fn().mockResolvedValue({ error: { message: "rate limit: provider secret" } }),
    }));

    const result = await instagramProvider.publishWithUrl(input, "https://example.test/file.jpg");

    expect(result).toEqual({
      ok: false,
      errorCode: "INSTAGRAM_API_ERROR",
      message: "انتشار در Instagram انجام نشد. دوباره تلاش کنید.",
      retryable: true,
    });
    expect(consoleError).toHaveBeenCalledWith("[instagram-provider] publish failed:", expect.any(Error));
  });
});
