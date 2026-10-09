import { describe, expect, it } from "vitest";
import { signImpersonation, verifyImpersonation, IMPERSONATION_TTL_MS } from "./auth";

describe("owner impersonation tokens", () => {
  it("round-trips a fresh token as non-expired", () => {
    const token = signImpersonation({ ownerId: "USR-1", targetId: "USR-2", startedAt: Date.now() });
    const parsed = verifyImpersonation(token);
    expect(parsed?.ownerId).toBe("USR-1");
    expect(parsed?.targetId).toBe("USR-2");
    expect(parsed?.expired).toBe(false);
    expect(IMPERSONATION_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("marks old tokens expired", () => {
    const token = signImpersonation({ ownerId: "USR-1", targetId: "USR-2", startedAt: Date.now() - IMPERSONATION_TTL_MS - 1000 });
    expect(verifyImpersonation(token)?.expired).toBe(true);
  });

  it("rejects garbage and incomplete payloads", () => {
    expect(verifyImpersonation("garbage")).toBeNull();
    expect(verifyImpersonation(signImpersonation({ ownerId: "", targetId: "USR-2", startedAt: Date.now() }))).toBeNull();
  });
});
