import { describe, expect, it } from "vitest";
import { matchBoardChannel, normName } from "./avatar-match";
import { BOARD_CHANNELS } from "./channels";

const CHANNELS = BOARD_CHANNELS.map((c) => ({ id: c.id, nameFa: c.nameFa }));

describe("matchBoardChannel", () => {
  it("matches the real connected account display names", () => {
    expect(matchBoardChannel("ZaviyeNo | زاویه نو", CHANNELS)).toBe("zaviye_no");
    expect(matchBoardChannel("Tamashin | تماشین", CHANNELS)).toBe("tamashin");
    expect(matchBoardChannel("ZedRevayat | ضدروایت", CHANNELS)).toBe("zed_revayat");
    expect(matchBoardChannel("Iranian Frame", CHANNELS)).toBe("iranian_frame");
  });

  it("returns null for unknown names", () => {
    expect(matchBoardChannel("Some Random Channel", CHANNELS)).toBeNull();
    expect(matchBoardChannel("", CHANNELS)).toBeNull();
  });

  it("normalizes separators and Persian forms", () => {
    expect(normName("Zed Revayat-ضد روایت")).toContain("zedrevayat");
  });
});
