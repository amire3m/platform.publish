import { describe, expect, it } from "vitest";

import { applyMapping, mapHeaders, parseCsv, toCsvRow, validateMapped } from "./csv";
import { filterRows, lowHighPerformers, monetizationProgress, programShare, topVideos, totals, viewsOverTime } from "./stats";
import { demoRows } from "./demo";

describe("parseCsv", () => {
  it("handles quotes, commas and newlines", () => {
    const out = parseCsv('a,b\n"1,2",3\n"x\ny",z\n');
    expect(out).toEqual([["a", "b"], ["1,2", "3"], ["x\ny", "z"]]);
  });
  it("strips BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("mapHeaders", () => {
  it("maps Persian and English headers, leaves unknown null", () => {
    expect(mapHeaders(["نام کانال", "Video Title", "ستون غریب"])).toEqual(["channel", "videoTitle", null]);
  });
});

describe("applyMapping + validate + toCsvRow", () => {
  it("maps, validates and converts", () => {
    const header = ["نام کانال", "تاریخ", "عنوان ویدیو", "تعداد بازدید"];
    const mapping = mapHeaders(header);
    const { rows, unmapped } = applyMapping(header, [["زاویه نو", "2026-05-01", "فرات ۱", "12,500"], ["", "", "", ""]], mapping);
    expect(unmapped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(validateMapped(rows)).toEqual([]);
    expect(toCsvRow(rows[0])).toMatchObject({ channel: "زاویه نو", views: 12500, program: "نامشخص" });
  });
  it("flags bad rows", () => {
    expect(validateMapped([{ channel: "", date: "not-a-date", views: "abc" } as never])).toHaveLength(3);
  });
});

describe("stats", () => {
  const rows = demoRows();
  it("demo dataset is flagged and stable", () => {
    expect(rows.length).toBe(40);
    expect(rows.every((r) => r.demo)).toBe(true);
    expect(demoRows()[0]).toEqual(rows[0]);
  });
  it("totals add up", () => {
    const t = totals(rows);
    expect(t.videos).toBe(40);
    expect(t.avgViews).toBe(Math.round(t.views / 40));
  });
  it("filters by channel and range", () => {
    expect(filterRows(rows, { channels: ["زاویه نو"] }).every((r) => r.channel === "زاویه نو")).toBe(true);
    const f = filterRows(rows, { range: { from: "2026-06-01", to: "2026-06-30" } });
    expect(f.every((r) => r.date >= "2026-06-01" && r.date <= "2026-06-30")).toBe(true);
  });
  it("never surfaces hidden channels", () => {
    const hidden = [
      { ...rows[0], channel: "shock" },
      { ...rows[0], channel: "tinazh" },
      { ...rows[0], channel: "شوک" },
      { ...rows[0], channel: "تیناژ" },
    ];
    expect(filterRows([...rows, ...hidden], {})).toHaveLength(rows.length);
    expect(filterRows(hidden, {})).toHaveLength(0);
  });
  it("builds time series, shares and tops", () => {
    expect(viewsOverTime(rows).length).toBeGreaterThan(0);
    const share = programShare(rows.filter((r) => r.channel === "زاویه نو"));
    expect(share[0].name).toBe("فرات");
    expect(topVideos(rows, 3)).toHaveLength(3);
    const { low, high } = lowHighPerformers(rows);
    expect(high[0].views).toBeGreaterThanOrEqual(low[0].views);
  });
  it("computes monetization progress", () => {
    const m = monetizationProgress(rows);
    expect(m.subsPct).toBeGreaterThanOrEqual(0);
    expect(m.hoursPct).toBeGreaterThanOrEqual(0);
  });
});
