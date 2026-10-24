import { describe, expect, it } from "vitest";

import {
  decodeTaskCursor,
  encodeTaskCursor,
  resolveCompletedRange,
  resolveDueRange,
  visibleChannelsForActor,
} from "./postgres-port";

describe("task cursor encoding", () => {
  it("round-trips every field in an open cursor", () => {
    const value = {
      dueAt: "2026-10-24T10:00:00.000Z",
      createdAt: "2026-10-20T08:00:00.000Z",
      id: "TSK-1405-000001",
    };

    expect(decodeTaskCursor("open", encodeTaskCursor("open", value))).toEqual(value);
  });

  it("rejects malformed and cross-column cursors", () => {
    expect(() => decodeTaskCursor("open", "not-base64")).toThrowError(/cursor/i);
    const completed = encodeTaskCursor("completed", {
      completedAt: "2026-10-24T10:00:00.000Z",
      id: "TSK-1405-000001",
    });
    expect(() => decodeTaskCursor("open", completed)).toThrowError(/cursor/i);
  });
});

describe("Tehran task ranges", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");

  it("defaults completed work to thirty Tehran calendar days", () => {
    const range = resolveCompletedRange({ now });

    expect(range.from.toISOString()).toBe("2026-09-23T20:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-24T20:29:59.999Z");
  });

  it("defines today and week using Tehran boundaries", () => {
    expect(resolveDueRange("today", now)).toEqual({
      from: new Date("2026-10-23T20:30:00.000Z"),
      to: new Date("2026-10-24T20:29:59.999Z"),
    });
    expect(resolveDueRange("week", now)).toEqual({
      from: new Date("2026-10-23T20:30:00.000Z"),
      to: new Date("2026-10-30T20:29:59.999Z"),
    });
  });
});

describe("task channel scope", () => {
  it("uses null for unrestricted non-hidden scope", () => {
    expect(visibleChannelsForActor({ role: "editor", allowedChannels: [] })).toBeNull();
    expect(visibleChannelsForActor({ role: "owner", allowedChannels: ["tamashin"] })).toBeNull();
  });

  it("removes hidden channels from explicit scope", () => {
    expect(visibleChannelsForActor({ role: "editor", allowedChannels: ["tamashin", "shock"] })).toEqual(["tamashin"]);
  });
});
