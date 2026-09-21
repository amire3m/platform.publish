import { describe, expect, it } from "vitest";

import { hasBrowserSession, saveBrowserSession, saveBrowserSessionFromCookies, sessionPath } from "./session";

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

  it("builds a valid storageState from pasted cookies", async () => {
    await saveBrowserSessionFromCookies("test-cookies-acc", { sessionid: "abc123", csrftoken: "tok" });
    const ok = await hasBrowserSession("test-cookies-acc");
    expect(ok).toBe(true);
    const { unlink } = await import("node:fs/promises");
    await unlink(sessionPath("test-cookies-acc")).catch(() => {});
  });

  it("rejects empty sessionid in cookies mode", async () => {
    await expect(saveBrowserSessionFromCookies("x", { sessionid: "" })).rejects.toThrow("sessionid");
  });

  it("reports health for an existing session", async () => {
    await saveBrowserSessionFromCookies("health-acc", { sessionid: "abc123" });
    const { getBrowserSessionHealth } = await import("./session");
    const h = await getBrowserSessionHealth("health-acc");
    expect(h.exists).toBe(true);
    expect(h.cookieCount).toBeGreaterThan(0);
    const { unlink } = await import("node:fs/promises");
    await unlink(sessionPath("health-acc")).catch(() => {});
  });
});
