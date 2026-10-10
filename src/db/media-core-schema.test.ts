import { describe, expect, it } from "vitest";
import { mediaAssets, mediaRevisions, mediaStorageObjects, mediaUploadSessions } from "./schema";

describe("media core schema", () => {
  it("exposes asset/revision/object/session tables", () => {
    expect(mediaAssets).toBeDefined();
    expect(mediaRevisions).toBeDefined();
    expect(mediaStorageObjects).toBeDefined();
    expect(mediaUploadSessions).toBeDefined();
  });
});
