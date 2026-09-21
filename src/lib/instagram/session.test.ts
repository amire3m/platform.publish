import { describe, expect, it, vi } from "vitest";

import { hasBrowserSession, saveBrowserSession, sessionPath } from "./session";

describe("instagram session", () => {
  it("rejects invalid storageState payloads", async () => {
    await expect(saveBrowserSession("a1", "")).rejects.toThrow("خالی");
    await expect(saveBrowserSession("a1", "   ")).rejects.toThrow("خالی");
    await expect(saveBrowserSession("a1", "{\"bad json\":}")).rejects.toThrow("JSON");
    await expect(saveBrowserSession("a1", JSON.stringify({ cookies: "x" }))).rejects.toThrow("فرمت");
  });

  it("exposes a deterministic session path per account", () => {
    expect(sessionPath("ACC-1")).toContain("ACC-1");
    expect(sessionPath("ACC-1")).toContain("storageState.json");
  });

  it("hasBrowserSession is false when no file exists", async () => {
    const ok = await hasBrowserSession("no-such-account-xyz-999");
    expect(ok).toBe(false);
  });
});
