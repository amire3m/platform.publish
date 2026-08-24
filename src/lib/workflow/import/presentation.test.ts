import { describe, expect, it } from "vitest";
import { presentImportResult } from "./presentation";

describe("import result presentation", () => {
  it("presents counts and row results without raw objects", () => {
    expect(
      presentImportResult({
        batchId: "WIB-123",
        counts: { total: 3, created: 1, updated: 1, skipped: 1, failed: 0 },
        results: [
          { rowIndex: 0, status: "created", programId: "WPR-1" },
          { rowIndex: 1, status: "updated", programId: "WPR-2" },
          { rowIndex: 2, status: "skipped", reason: "row not found" },
        ],
      }),
    ).toEqual({
      batchId: "WIB-123",
      counts: [
        { label: "کل ردیف‌ها", value: 3 },
        { label: "ایجادشده", value: 1 },
        { label: "به‌روزرسانی‌شده", value: 1 },
        { label: "ردشده", value: 1 },
        { label: "ناموفق", value: 0 },
      ],
      rows: [
        { row: 1, status: "ایجاد شد", detail: "شناسه برنامه: WPR-1" },
        { row: 2, status: "به‌روزرسانی شد", detail: "شناسه برنامه: WPR-2" },
        { row: 3, status: "رد شد", detail: "ردیف در پیش‌نمایش یافت نشد." },
      ],
    });
  });

  it("uses safe fallbacks for malformed or unknown results", () => {
    expect(presentImportResult({ results: [{ rowIndex: 0, status: "internal_code", reason: "secret" }] }).rows).toEqual([
      { row: 1, status: "مورد ناشناخته", detail: "جزئیات بیشتری ثبت نشده است." },
    ]);
  });
});
