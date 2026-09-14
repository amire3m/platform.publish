import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...(actual as object),
    requirePermission: vi.fn().mockResolvedValue({
      user: { id: "u1", role: "manager", allowedActions: [], allowedAccountIds: [] },
      response: null,
    }),
  };
});

vi.mock("@/lib/channel-accounts", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...(actual as object),
    readChannelOverrides: vi.fn().mockResolvedValue({}),
    saveChannelOverride: vi.fn().mockImplementation(async (channelId: string, patch: Record<string, unknown>) => ({
      channelId,
      youtubeAccountId: null,
      instagramAccountId: null,
      telegramTopicId: null,
      ...patch,
    })),
  };
});

import { GET, PATCH } from "./route";
import { readChannelOverrides, saveChannelOverride } from "@/lib/channel-accounts";

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/channels", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("GET /api/channels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges DB overrides with linked flags", async () => {
    vi.mocked(readChannelOverrides).mockResolvedValue({
      zed_revayat: { channelId: "zed_revayat", youtubeAccountId: "acc-1", instagramAccountId: null, telegramTopicId: null },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const zed = body.data.channels.find((c: { id: string }) => c.id === "zed_revayat");
    expect(zed.youtubeAccountId).toBe("acc-1");
    expect(zed.linked).toEqual({ youtube: true, instagram: false, telegram: false });
  });
});

describe("PATCH /api/channels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists youtube linkage", async () => {
    const res = await PATCH(patchReq({ channelId: "zed_revayat", platform: "youtube", accountId: "acc-1" }));
    expect(res.status).toBe(200);
    expect(saveChannelOverride).toHaveBeenCalledWith("zed_revayat", { youtubeAccountId: "acc-1" }, "u1");
    const body = await res.json();
    expect(body.data.channel.youtubeAccountId).toBe("acc-1");
    expect(body.data.channel.linked.youtube).toBe(true);
  });

  it("persists telegram topic linkage", async () => {
    const res = await PATCH(patchReq({ channelId: "tamashin", platform: "telegram", telegramTopicId: "777" }));
    expect(res.status).toBe(200);
    expect(saveChannelOverride).toHaveBeenCalledWith("tamashin", { telegramTopicId: "777" }, "u1");
  });

  it("rejects invalid platform (422)", async () => {
    const res = await PATCH(patchReq({ channelId: "zed_revayat", platform: "nope" }));
    expect(res.status).toBe(422);
    expect(saveChannelOverride).not.toHaveBeenCalled();
  });
});
