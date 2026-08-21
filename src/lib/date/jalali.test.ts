import { describe, expect, it } from "vitest";

import { formatTehranGregorianDate, startOfTehranDayUtc } from "@/lib/date/jalali";

describe("startOfTehranDayUtc", () => {
  it("normalizes different times in one Tehran calendar day to the same UTC instant", () => {
    const morning = startOfTehranDayUtc(new Date("2026-08-20T21:15:00.000Z"));
    const evening = startOfTehranDayUtc(new Date("2026-08-21T18:00:00.000Z"));

    expect(morning.toISOString()).toBe("2026-08-20T20:30:00.000Z");
    expect(evening).toEqual(morning);
  });

  it("changes normalized day exactly at Tehran local midnight", () => {
    expect(startOfTehranDayUtc(new Date("2026-08-20T20:29:59.999Z")).toISOString())
      .toBe("2026-08-19T20:30:00.000Z");
    expect(startOfTehranDayUtc(new Date("2026-08-20T20:30:00.000Z")).toISOString())
      .toBe("2026-08-20T20:30:00.000Z");
  });

  it("uses the historical Tehran offset across the 2022 DST transition", () => {
    expect(startOfTehranDayUtc(new Date("2022-09-21T12:00:00.000Z")).toISOString())
      .toBe("2022-09-20T19:30:00.000Z");
    expect(startOfTehranDayUtc(new Date("2022-09-22T12:00:00.000Z")).toISOString())
      .toBe("2022-09-21T20:30:00.000Z");
  });
});

describe("formatTehranGregorianDate", () => {
  it("formats a UTC instant using its Asia/Tehran calendar date", () => {
    expect(formatTehranGregorianDate(new Date("2026-08-20T20:30:00.000Z")))
      .toBe("2026-08-21");
  });
});
