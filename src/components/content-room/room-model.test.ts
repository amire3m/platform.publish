import { describe, expect, it } from "vitest";
import { filterProducts, contentRoomFilters, getProductProgress, getNextAction } from "./room-model";
import type { ContentRoomProductSummary } from "./types";

function summary(patch: Partial<ContentRoomProductSummary> & { id: string }): ContentRoomProductSummary {
  return {
    title: patch.title ?? patch.id,
    productType: patch.productType ?? "serial",
    channel: patch.channel ?? "zed_revayat",
    partsCount: patch.partsCount ?? 1,
    status: patch.status ?? "imported",
    version: patch.version ?? 1,
    ...patch,
  } as ContentRoomProductSummary;
}

const rows: ContentRoomProductSummary[] = [
  summary({ id: "a", title: "سریال فرات", productType: "serial", channel: "zed_revayat", status: "imported" }),
  summary({ id: "b", title: "مستند طبیعت", productType: "documentary", channel: "tamashin", status: "editing_youtube" }),
  summary({ id: "c", title: "فیلم سینمایی آرش", productType: "film", channel: "shock", status: "ready_to_send" }),
  summary({ id: "d", title: "آموزشی پایتون", productType: "educational", channel: "tinazh", status: "highlight_done" }),
];

describe("filterProducts", () => {
  it("filters by query", () => {
    expect(filterProducts(rows, contentRoomFilters({ query: "فرات" }))).toHaveLength(1);
  });
  it("filters by productType", () => {
    expect(filterProducts(rows, contentRoomFilters({ productType: "serial" })).map((r) => r.id)).toEqual(["a"]);
  });
  it("filters by channel", () => {
    expect(filterProducts(rows, contentRoomFilters({ channel: "shock" })).map((r) => r.id)).toEqual(["c"]);
  });
  it("filters by status", () => {
    expect(filterProducts(rows, contentRoomFilters({ status: "ready_to_send" })).map((r) => r.id)).toEqual(["c"]);
  });
  it("combines filters", () => {
    expect(
      filterProducts(rows, contentRoomFilters({ query: "فیلم", channel: "shock", status: "ready_to_send" })),
    ).toHaveLength(1);
  });
  it("keeps original order stable and pure", () => {
    const originalIds = rows.map((r) => r.id);
    const filtered = filterProducts(rows, contentRoomFilters({}));
    expect(rows.map((r) => r.id)).toEqual(originalIds);
    expect(filtered).toHaveLength(rows.length);
  });
  it("trims query case-insensitively", () => {
    expect(filterProducts(rows, contentRoomFilters({ query: "  فرات  " }))).toHaveLength(1);
  });
});

describe("getProductProgress", () => {
  it("computes progress percent", () => {
    expect(getProductProgress("imported").percent).toBe(14);
    expect(getProductProgress("ready_to_send").percent).toBe(100);
  });

  it("does not expose an unknown status identifier", () => {
    expect(getProductProgress("internal_status")).toEqual({ percent: 0, label: "مورد ناشناخته" });
  });
});

describe("getNextAction", () => {
  it("returns next status label or آماده ارسال", () => {
    expect(getNextAction("imported")).toBe("در تدوین یوتیوب");
    expect(getNextAction("ready_to_send")).toBe("آماده ارسال");
  });
});
