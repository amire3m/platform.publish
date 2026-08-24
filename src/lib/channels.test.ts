import { describe, expect, it } from "vitest";
import { CHANNEL_GROUPS } from "./channels";

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
});
