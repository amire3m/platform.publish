import { describe, expect, it } from "vitest";
import { shouldEnqueueForNewVideo } from "./sync-controller";
describe("auto-sync", () => {
  it("enqueues 2 hours after publish for same channel", () => {
    const lastPublish = new Date(Date.now() - 1000);
    expect(shouldEnqueueForNewVideo(lastPublish, "ACC-1")).toBe(true);
  });
});
