import { describe, expect, it } from "vitest";

import { getEventUid } from "./calendar-conflicts";

describe("getEventUid", () => {
  it("uses stable display IDs for events without content records", () => {
    const base = {
      contentId: null,
      publicationId: null,
      title: "برنامه انتشار",
      platform: "youtube",
      accountId: "ACC-1405-398046",
      channel: "zaviye_no",
      publishAtUtc: "2026-10-24T07:30:00Z",
    };

    expect(getEventUid({ ...base, displayId: "plan-1405-08-02-01" })).toBe("display:plan-1405-08-02-01");
    expect(getEventUid({ ...base, displayId: "plan-1405-08-06-01" })).toBe("display:plan-1405-08-06-01");
  });
});
