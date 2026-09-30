import { describe, expect, it } from "vitest";
import { detectChanges, type VideoStatus } from "./status-watch";

const meta = {
  publicationId: "WPB-1",
  deliverableName: "ویدیو کامل",
  programTitle: "برنامه",
  accountId: "ACC-1",
  externalId: "abc123",
};

function curr(overrides: Partial<VideoStatus>): VideoStatus {
  return { videoId: "abc123", uploadStatus: "processed", rejectionReason: null, privacyStatus: "private", missing: false, ...overrides };
}

describe("detectChanges", () => {
  it("silent on first sight of healthy video", () => {
    expect(detectChanges(null, curr({}), meta)).toBeNull();
  });

  it("alerts on new claim rejection", () => {
    const c = detectChanges(
      { uploadStatus: "processed", rejectionReason: null, privacyStatus: "private" },
      curr({ uploadStatus: "rejected", rejectionReason: "claim" }),
      meta,
    );
    expect(c?.kind).toBe("rejected_claim");
    expect(c?.message).toContain("صاحب اثر");
  });

  it("alerts on new copyright rejection", () => {
    const c = detectChanges(
      { uploadStatus: "processed", rejectionReason: null, privacyStatus: "private" },
      curr({ uploadStatus: "rejected", rejectionReason: "copyright" }),
      meta,
    );
    expect(c?.kind).toBe("rejected_copyright");
  });

  it("does not repeat the same terminal state", () => {
    const c = detectChanges(
      { uploadStatus: "rejected", rejectionReason: "claim", privacyStatus: "private" },
      curr({ uploadStatus: "rejected", rejectionReason: "claim" }),
      meta,
    );
    expect(c).toBeNull();
  });

  it("alerts when video disappears (takedown)", () => {
    const c = detectChanges(
      { uploadStatus: "processed", rejectionReason: null, privacyStatus: "private" },
      curr({ missing: true, uploadStatus: null, privacyStatus: null }),
      meta,
    );
    expect(c?.kind).toBe("deleted");
  });

  it("alerts on privacy change", () => {
    const c = detectChanges(
      { uploadStatus: "processed", rejectionReason: null, privacyStatus: "public" },
      curr({ privacyStatus: "private" }),
      meta,
    );
    expect(c?.kind).toBe("privacy_changed");
  });
});
