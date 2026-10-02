import { beforeEach, describe, expect, it } from "vitest";
import { clearLoginCodes, issueLoginCode, liveLoginCodeCount, verifyLoginCode, LOGIN_CODE_TTL_MS } from "./login-codes";

describe("login codes", () => {
  beforeEach(() => clearLoginCodes());

  it("issues a 6-digit code bound to the telegram id", () => {
    const { code, expiresAt } = issueLoginCode("123");
    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(liveLoginCodeCount()).toBe(1);
  });

  it("verifies and consumes single-use codes", () => {
    const { code } = issueLoginCode("123");
    expect(verifyLoginCode(code)).toEqual({ ok: true, telegramId: "123" });
    expect(verifyLoginCode(code)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(liveLoginCodeCount()).toBe(0);
  });

  it("rejects unknown codes", () => {
    issueLoginCode("123");
    expect(verifyLoginCode("000000")).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("expires codes after TTL", () => {
    const now = Date.now();
    const { code } = issueLoginCode("123", now);
    expect(verifyLoginCode(code, now + LOGIN_CODE_TTL_MS + 1000)).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("replaces the previous live code for the same user", () => {
    const first = issueLoginCode("123");
    const second = issueLoginCode("123");
    expect(second.code).not.toBe(first.code);
    expect(verifyLoginCode(first.code)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(verifyLoginCode(second.code)).toEqual({ ok: true, telegramId: "123" });
  });
});
