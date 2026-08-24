import { describe, expect, it } from "vitest";

import { parseCsv } from "./csv-parser";

const limits = { maxRows: 10000, maxCols: 200 };

describe("parseCsv", () => {
  it("handles quoted commas and embedded line breaks", () => {
    expect(parseCsv('نام,"عنوان، کامل"\r\nفرات,"متن\nدوخطی"', limits)).toEqual([
      ["نام", "عنوان، کامل"],
      ["فرات", "متن\nدوخطی"],
    ]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsv('"a""b",c', limits)).toEqual([['a"b', "c"]]);
  });

  it("handles CRLF and LF", () => {
    expect(parseCsv("a,b\r\n1,2\n3,4", limits)).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("preserves empty trailing cells", () => {
    expect(parseCsv("a,b,\n1,2,", limits)).toEqual([
      ["a", "b", ""],
      ["1", "2", ""],
    ]);
  });

  it("strips BOM", () => {
    expect(parseCsv("\uFEFFa,b\n1,2", limits)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("treats formula text without evaluation", () => {
    expect(parseCsv('a,b\n"=SUM(A1:A2)",c', limits)).toEqual([
      ["a", "b"],
      ["=SUM(A1:A2)", "c"],
    ]);
  });

  it("rejects too many rows", () => {
    const many = Array.from({ length: 10001 }, () => "a,b").join("\n");
    expect(() => parseCsv(many, limits)).toThrow("تعداد ردیف‌های CSV از حد مجاز ۱۰۰۰۰ بیشتر است.");
  });

  it("rejects too many columns", () => {
    const row = Array.from({ length: 201 }, () => "a").join(",");
    expect(() => parseCsv(row, limits)).toThrow("تعداد ستون‌های CSV از حد مجاز ۲۰۰ بیشتر است.");
  });

  it("handles empty input", () => {
    expect(parseCsv("", limits)).toEqual([]);
  });
});
