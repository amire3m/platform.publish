import { describe, expect, it } from "vitest";

import { mergeChannelOverrides } from "./channel-accounts";
import type { ChannelConfig } from "@/lib/channels";

const STATIC: ChannelConfig[] = [
  { id: "zed_revayat", labelFa: "x", organization: "emro", youtubeAccountId: null, instagramAccountId: null, telegramTopicId: null, publicTelegramChatId: null },
  { id: "tamashin", labelFa: "y", organization: "emro", youtubeAccountId: "static-yt", instagramAccountId: null, telegramTopicId: null, publicTelegramChatId: null },
];

describe("mergeChannelOverrides", () => {
  it("overrides static config with DB rows and recomputes linked flags", () => {
    const out = mergeChannelOverrides(STATIC, {
      zed_revayat: { channelId: "zed_revayat", youtubeAccountId: "acc-1", instagramAccountId: null, telegramTopicId: "777" },
    });
    const zed = out.find((c) => c.id === "zed_revayat")!;
    expect(zed.youtubeAccountId).toBe("acc-1");
    expect(zed.telegramTopicId).toBe("777");
    expect(zed.linked).toEqual({ youtube: true, instagram: false, telegram: true });
    const tam = out.find((c) => c.id === "tamashin")!;
    expect(tam.youtubeAccountId).toBe("static-yt");
    expect(tam.linked.youtube).toBe(true);
  });

  it("ignores overrides for unknown channels", () => {
    const out = mergeChannelOverrides(STATIC, {
      nope: { channelId: "nope", youtubeAccountId: "a", instagramAccountId: null, telegramTopicId: null },
    });
    expect(out).toHaveLength(2);
  });
});
