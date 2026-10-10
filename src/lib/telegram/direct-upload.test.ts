import { describe, expect, it } from "vitest";
import { sanitizeUploadFilename } from "./direct-upload";

describe("sanitizeUploadFilename", () => {
  it("keeps safe names", () => {
    expect(sanitizeUploadFilename("video final (2).mp4")).toBe("video final (2).mp4");
  });
  it("strips path traversal and weird chars", () => {
    expect(sanitizeUploadFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeUploadFilename("a/b\\c.mp4")).toBe("c.mp4");
    expect(sanitizeUploadFilename("")).toBe("upload.bin");
  });
  it("truncates long names", () => {
    expect(sanitizeUploadFilename(`x${"y".repeat(200)}.mp4`).length).toBeLessThanOrEqual(120);
  });
});
