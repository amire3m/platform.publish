import { describe, expect, it } from "vitest";
import { socialAccountConnectSchema } from "./validation";

describe("socialAccountConnectSchema", () => {
  it("accepts OAuth account connections", () => {
    expect(socialAccountConnectSchema.safeParse({ mode: "oauth" }).success).toBe(true);
  });

  it("rejects mock account creation", () => {
    expect(socialAccountConnectSchema.safeParse({
      mode: "mock",
      username: "test-channel",
      displayName: "Test Channel",
    }).success).toBe(false);
  });
});
