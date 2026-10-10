import { describe, expect, it } from "vitest";
import { selectStaleOpenSessions } from "./staging-sweep";

describe("selectStaleOpenSessions", () => {
  it("selects open sessions older than TTL and ignores the rest", () => {
    const now = new Date("2026-10-10T12:00:00Z").getTime();
    const rows = [
      { id: "old-open", status: "open", updatedAt: new Date("2026-10-09T10:00:00Z") },
      { id: "fresh-open", status: "open", updatedAt: new Date("2026-10-10T11:00:00Z") },
      { id: "old-complete", status: "complete", updatedAt: new Date("2026-10-09T10:00:00Z") },
    ];
    expect(selectStaleOpenSessions(rows, now, 12)).toEqual(["old-open"]);
  });

  it("returns empty when nothing is stale", () => {
    const now = Date.now();
    expect(selectStaleOpenSessions([{ id: "a", status: "open", updatedAt: new Date(now) }], now, 24)).toEqual([]);
  });
});
