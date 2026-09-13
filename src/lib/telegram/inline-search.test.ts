import { describe, expect, it } from "vitest";

import { buildInlineResults } from "./inline-search";

const PRODUCTS = [
  { id: "CPR-1", title: "فرات <قسمت> اول", productType: "serial", channel: "zed_revayat", status: "imported", partsCount: 3 },
  { id: "CPR-2", title: "مستند طبیعت", productType: "documentary", channel: "tamashin", status: "ready_to_send", partsCount: 1 },
];

describe("buildInlineResults", () => {
  it("maps products to articles with panel links", () => {
    const results = buildInlineResults(PRODUCTS, "https://app.example");
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      type: "article",
      id: "CPR-1",
      title: "فرات <قسمت> اول",
    });
    const first = results[0] as unknown as {
      description: string;
      input_message_content: { message_text: string };
      reply_markup: { inline_keyboard: Array<Array<{ url: string }>> };
    };
    expect(first.description).toContain("3 قسمت");
    expect(first.input_message_content.message_text).toContain("فرات &lt;قسمت&gt; اول");
    expect(first.reply_markup.inline_keyboard[0][0].url).toBe("https://app.example/content-room/CPR-1");
  });

  it("omits markup when no base URL is configured", () => {
    const results = buildInlineResults([PRODUCTS[0]], null);
    expect(results).toHaveLength(1);
    expect(results[0]).not.toHaveProperty("reply_markup");
    const first = results[0] as unknown as { input_message_content: { message_text: string } };
    expect(first.input_message_content.message_text).toContain("فرات");
  });

  it("returns empty for empty input", () => {
    expect(buildInlineResults([], "https://app.example")).toEqual([]);
  });
});
