import { describe, expect, it } from "vitest";
import {
  filterProducts,
  contentRoomFilters,
  getProductProgress,
  getNextAction,
  progressFromActivities,
  getProductProgressFromActivities,
  getNextActionFromActivities,
  PRODUCT_TYPE_LABELS,
} from "./room-model";
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

describe("PRODUCT_TYPE_LABELS", () => {
  it("includes teaser and music_video Persian labels", () => {
    expect(PRODUCT_TYPE_LABELS.teaser).toBe("تیزر");
    expect(PRODUCT_TYPE_LABELS.music_video).toBe("نماهنگ");
  });
});

describe("progressFromActivities", () => {
  it("computes ready_to_send only when required activities done", () => {
    const detail = {
      parts: [
        {
          isActive: true,
          activities: {
            editing_youtube: true,
            copyright_fix: true,
            highlight_done: true,
            reel_done: true,
            cover_ready: true,
            previously_published: false,
          },
        },
      ],
    } as never;
    expect(progressFromActivities(detail)).toBe(1);
    expect(getProductProgressFromActivities(detail).percent).toBe(100);
    expect(getNextActionFromActivities(detail)).toBe("آماده ارسال");
  });

  it("computes partial progress derived from active parts and REQUIRED_FOR_SEND", () => {
    const detail = {
      parts: [
        {
          isActive: true,
          activities: { editing_youtube: true, copyright_fix: false, highlight_done: false, reel_done: false, cover_ready: false, previously_published: false },
        },
        {
          isActive: true,
          activities: { editing_youtube: true, copyright_fix: true, highlight_done: true, reel_done: false, cover_ready: false, previously_published: false },
        },
      ],
    } as never;
    // 4 completed out of 10 (2 parts *5)
    expect(progressFromActivities(detail)).toBe(0.4);
    expect(getProductProgressFromActivities(detail).percent).toBe(40);
  });

  it("excludes inactive and previously_published parts", () => {
    const detail = {
      parts: [
        { isActive: false, activities: { editing_youtube: true, copyright_fix: true, highlight_done: true, reel_done: true, cover_ready: true, previously_published: false } },
        { isActive: true, activities: { editing_youtube: false, copyright_fix: false, highlight_done: false, reel_done: false, cover_ready: false, previously_published: true } },
      ],
    } as never;
    expect(progressFromActivities(detail)).toBe(1);
    expect(getNextActionFromActivities(detail)).toBe("قبلاً منتشر شده");
  });

  it("returns 0 when no active sendable parts and no previously_published", () => {
    expect(progressFromActivities({ parts: [] } as never)).toBe(0);
  });
});
