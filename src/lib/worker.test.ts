import { describe, expect, it } from "vitest";
describe("worker beautiful", () => {
  it("success message has no TGDB", async () => {
    const { beautifyPublishSuccess } = await import("@/lib/telegram/beautify");
    const { text } = beautifyPublishSuccess({ content_id: "CNT-1", title: "تست", targets: [] });
    expect(text).not.toContain("TGDB");
    expect(text).toContain("✅");
  });
  it("error message has no TGDB and contains ❌", async () => {
    const { beautifyPublishError } = await import("@/lib/telegram/beautify");
    const { text } = beautifyPublishError({ content_id: "CNT-1", title: "تست", targets: [{ lastError: "خطا" }] });
    expect(text).not.toContain("TGDB");
    expect(text).toContain("❌");
  });
  it("content keyboard respects 2 rows limit", async () => {
    const { buildContentKeyboard } = await import("@/lib/telegram/keyboards");
    const kb = buildContentKeyboard("CNT-1405-000001", "draft", "pending");
    expect(kb.inline_keyboard.length).toBeLessThanOrEqual(2);
    expect(kb.inline_keyboard[0].length).toBeLessThanOrEqual(3);
    expect(kb.inline_keyboard.flat().some((b) => b.callback_data === "approve:CNT-1405-000001")).toBe(true);
  });
});
