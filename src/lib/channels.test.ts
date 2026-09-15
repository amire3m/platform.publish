import { describe, expect, it } from "vitest";
import { CHANNEL_GROUPS, VISIBLE_CHANNEL_GROUPS, VISIBLE_CHANNEL_IDS, isChannelHidden } from "./channels";

describe("channel organizations", () => {
  it("groups the requested channels under Emro and Sana", () => {
    expect(CHANNEL_GROUPS.find((group) => group.id === "emro")?.channels.map((channel) => channel.id)).toEqual([
      "zed_revayat",
      "zaviye_no",
      "tamashin",
      "iranian_frame",
    ]);
    expect(CHANNEL_GROUPS.find((group) => group.id === "sana")?.channels.map((channel) => channel.id)).toEqual([
      "shock",
      "tinazh",
    ]);
  });

  it("hides shock/tinazh from every viewer surface", () => {
    expect(isChannelHidden("shock")).toBe(true);
    expect(isChannelHidden("tinazh")).toBe(true);
    expect(isChannelHidden("tamashin")).toBe(false);
    expect(VISIBLE_CHANNEL_IDS).toEqual(["zed_revayat", "zaviye_no", "tamashin", "iranian_frame"]);
    expect(VISIBLE_CHANNEL_GROUPS.find((group) => group.id === "sana")).toBeUndefined();
    expect(VISIBLE_CHANNEL_GROUPS.flatMap((g) => g.channels.map((c) => c.id))).not.toContain("shock");
    expect(VISIBLE_CHANNEL_GROUPS.flatMap((g) => g.channels.map((c) => c.id))).not.toContain("tinazh");
  });
});
