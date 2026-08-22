import { describe, expect, it } from "vitest";

import { normalizeWorkflowTitle } from "./normalization";
import { mapCell, mapSheetRows, suggestColumnMapping } from "./mapper";

describe("normalizeWorkflowTitle", () => {
  it("trims, collapses spaces and converts Persian digits", () => {
    expect(normalizeWorkflowTitle("  فرات   قسمت ۳۱ ")).toBe("فرات قسمت 31");
  });

  it("converts Arabic digits and normalizes", () => {
    expect(normalizeWorkflowTitle("قسمت ٣٤")).toBe("قسمت 34");
  });
});

describe("mapCell", () => {
  it("maps publication کامل to published", () => {
    expect(mapCell("کامل", { kind: "publication", platform: "youtube" })).toMatchObject({
      status: "published",
      terminalOwner: "imported",
    });
  });

  it("maps اصلاح شود to changes_requested production status", () => {
    expect(mapCell("اصلاح شود", { kind: "publication", deliverableName: "ریلز ۱" })).toMatchObject({
      productionStatus: "changes_requested",
    });
  });

  it("maps empty to not_started / waiting_for_production", () => {
    expect(mapCell("", { kind: "production" })).toMatchObject({ productionStatus: "not_started" });
    expect(mapCell("   ", { kind: "publication", platform: "telegram" })).toMatchObject({
      status: "waiting_for_production",
    });
  });

  it("maps منتشر نشود to do_not_publish", () => {
    expect(mapCell("منتشر نشود", { kind: "publication", platform: "telegram" })).toMatchObject({
      status: "do_not_publish",
    });
  });

  it("returns unknown for invalid value", () => {
    const result = mapCell("نامشخص", { kind: "publication", platform: "youtube", row: 2, column: 3 });
    expect(result).toMatchObject({ kind: "unknown", raw: "نامشخص", row: 2, column: 3 });
  });
});

describe("suggestColumnMapping", () => {
  it("groups headers like ریلز 1 در تلگرام and ریلز 1 در یوتیوب under one deliverable", () => {
    const headers = ["نام برنامه", "ریلز ۱ در تلگرام", "ریلز 1 در یوتیوب", "کاور"];
    const mapping = suggestColumnMapping(headers);
    // Expect two distinct deliverables: "ریلز 1" with two platforms, and "کاور"
    const deliverableNames = mapping.deliverables.map((d) => d.normalizedName);
    expect(deliverableNames).toContain("ریلز 1");
    const reels = mapping.deliverables.find((d) => d.normalizedName === "ریلز 1");
    expect(reels?.platforms).toEqual(expect.arrayContaining(["telegram", "youtube"]));
    // Columns for those two headers should point to same deliverable
    const col1 = mapping.columns.find((c) => c.index === 1);
    const col2 = mapping.columns.find((c) => c.index === 2);
    expect(col1?.deliverableNormalized).toBe("ریلز 1");
    expect(col2?.deliverableNormalized).toBe("ریلز 1");
  });

  it("identifies title column", () => {
    const mapping = suggestColumnMapping(["عنوان", "ریلز در تلگرام"]);
    const titleCol = mapping.columns.find((c) => c.role === "title");
    expect(titleCol).toBeDefined();
  });
});

describe("mapSheetRows", () => {
  it("maps rows and returns unknown cells", () => {
    const rows = [
      ["نام برنامه", "ریلز ۱ در تلگرام"],
      ["فرات قسمت 1", "کامل"],
      ["فرات قسمت 2", "نامشخص"],
    ];
    const mapping = suggestColumnMapping(rows[0]);
    const result = mapSheetRows(rows, mapping);
    // first data row should be published
    expect(result.rows[0].cells[0].mapped).toMatchObject({ status: "published" });
    // second data row unknown
    expect(result.rows[1].cells[0].mapped).toMatchObject({ kind: "unknown", raw: "نامشخص" });
    expect(result.unknowns).toHaveLength(1);
  });
});
