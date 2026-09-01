import { describe, expect, it, beforeEach } from "vitest";
import { setPendingReply, getPendingReply, consumePendingReply, clearPendingReply, pendingTtlSeconds } from "./pending-link";

describe("pending link registry", () => {
  beforeEach(() => {
    clearPendingReply("u1");
  });

  it("stores and consumes a pending entry", () => {
    setPendingReply("u1", { userId: "u1", partId: "P1", partNumber: 3, kind: "video" });
    const got = getPendingReply("u1");
    expect(got?.partId).toBe("P1");
    expect(got?.kind).toBe("video");
    const consumed = consumePendingReply("u1");
    expect(consumed?.partId).toBe("P1");
    expect(getPendingReply("u1")).toBeNull();
  });

  it("replaces previous pending entry per user", () => {
    setPendingReply("u1", { userId: "u1", partId: "P1", partNumber: 1, kind: "video" });
    setPendingReply("u1", { userId: "u1", partId: "P2", partNumber: 2, kind: "reel" });
    expect(getPendingReply("u1")?.partId).toBe("P2");
  });

  it("expires entries past TTL", () => {
    const entry = setPendingReply("u1", { userId: "u1", partId: "P1", partNumber: 1, kind: "cover" });
    // simulate expiry by rewinding timestamps
    entry.createdAt = Date.now() - 6 * 60_000;
    entry.expiresAt = Date.now() - 60_000;
    expect(getPendingReply("u1")).toBeNull();
  });

  it("reports remaining ttl", () => {
    const entry = setPendingReply("u1", { userId: "u1", partId: "P1", partNumber: 1, kind: "highlight" });
    expect(pendingTtlSeconds(entry)).toBeLessThanOrEqual(300);
    expect(pendingTtlSeconds(entry)).toBeGreaterThan(290);
  });
});
