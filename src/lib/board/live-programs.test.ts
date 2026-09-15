import { describe, expect, it } from "vitest";
import { cleanProgramTitle, matchBoardChannel, normName, programForPlaylists } from "./live-programs";
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

describe("programForPlaylists", () => {
  it("prefers curated programs from real playlist titles", () => {
    expect(programForPlaylists(["برنامه تلویزیونی فرات قسمت 30", "برش‌ها و کلیپ‌ها"])).toBe("فرات");
    expect(programForPlaylists(["برش های قابل توجه"])).toBe("قابل توجه");
    expect(programForPlaylists(["برنامه تلویزیونی قابل توجه", "فرات"])).toBe("فرات");
    expect(programForPlaylists(["مشاور قسمت 1"])).toBe("مشاور ۱");
  });

  it("falls back to the cleaned playlist title", () => {
    expect(programForPlaylists(["فیلم کوتاه ضامن"])).toBe("فیلم کوتاه ضامن");
    expect(programForPlaylists(["تیزر | Teasers"])).toBe("تیزر");
    expect(programForPlaylists([])).toBe("سایر");
  });

  it("cleans titles", () => {
    expect(cleanProgramTitle("IWIW - Iranian Women In War")).toBe("IWIW");
  });
});
