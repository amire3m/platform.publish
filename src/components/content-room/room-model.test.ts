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
  summary({ id: "b", title: "مستند طبیعت", productType: "documentary", channel: "tamashin", status: "copyright_fix" }),
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
  it("filters to video-unlinked products only when onlyUnlinked", () => {
    const mixed: ContentRoomProductSummary[] = [
      summary({ id: "full", linkedParts: 3, linkTotal: 3, partsCount: 3 }),
      summary({ id: "half", linkedParts: 1, linkTotal: 3, partsCount: 3 }),
      summary({ id: "none", linkedParts: 0, linkTotal: 2, partsCount: 2 }),
    ];
    expect(filterProducts(mixed, contentRoomFilters({ onlyUnlinked: true })).map((r) => r.id)).toEqual(["half", "none"]);
    expect(filterProducts(mixed, contentRoomFilters({}))).toHaveLength(3);
  });
});

describe("getProductProgress", () => {
  it("computes progress percent", () => {
    expect(getProductProgress("imported").percent).toBe(17);
    expect(getProductProgress("ready_to_send").percent).toBe(100);
    expect(getProductProgress("previously_published").percent).toBe(100);
  });

  it("does not expose an unknown status identifier", () => {
    expect(getProductProgress("internal_status")).toEqual({ percent: 0, label: "مورد ناشناخته" });
  });
});

describe("getNextAction", () => {
  it("returns next status label or آماده ارسال", () => {
    expect(getNextAction("imported")).toBe("رفع کپی‌رایت");
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
            raw_telegram: true,
            raw_compressed: true,
            yt_check_upload: true,
            copyright_report: true,
            music_replaced: true,
            final_full: true,
            cover_ready: true,
            highlight_done: true,
            reel_done: true,
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
          activities: { raw_telegram: true, raw_compressed: true, yt_check_upload: false, copyright_report: false, music_replaced: false, final_full: false, cover_ready: false, highlight_done: false, reel_done: false, previously_published: false },
        },
        {
          isActive: true,
          activities: { raw_telegram: true, raw_compressed: true, yt_check_upload: true, copyright_report: true, music_replaced: false, final_full: false, cover_ready: false, highlight_done: true, reel_done: false, previously_published: false },
        },
      ],
    } as never;
    // 7 completed out of 18 (2 parts * 9)
    expect(progressFromActivities(detail)).toBeCloseTo(7 / 18, 5);
    expect(getProductProgressFromActivities(detail).percent).toBe(39);
  });

  it("excludes inactive and previously_published parts", () => {
    const detail = {
      parts: [
        { isActive: false, activities: { raw_telegram: true, raw_compressed: true, yt_check_upload: true, copyright_report: true, music_replaced: true, final_full: true, cover_ready: true, highlight_done: true, reel_done: true, previously_published: false } },
        { isActive: true, activities: { raw_telegram: false, raw_compressed: false, yt_check_upload: false, copyright_report: false, music_replaced: false, final_full: false, cover_ready: false, highlight_done: false, reel_done: false, previously_published: true } },
      ],
    } as never;
    expect(progressFromActivities(detail)).toBe(1);
    expect(getNextActionFromActivities(detail)).toBe("قبلاً منتشر شده");
  });

  it("returns 0 when no active sendable parts and no previously_published", () => {
    expect(progressFromActivities({ parts: [] } as never)).toBe(0);
  });
});
