import { describe, expect, it } from "vitest";
import { batchCreateSchema, toggleActivitySchema, updateMetadataSchema } from "./validation";

describe("content-room validation batch", () => {
  it("rejects 11 products", () => {
    const input = {
      products: Array.from({ length: 11 }, (_, i) => ({ title: `T${i}`, productType: "teaser", channel: "tamashin", partsCount: 1 })),
    };
    expect(() => batchCreateSchema.parse(input)).toThrow();
  });

  it("accepts 10 products with teaser and music_video", () => {
    const input = {
      products: [
        { title: "Teaser film", productType: "teaser", channel: "tamashin", partsCount: 1 },
        { title: "Music vid", productType: "music_video", channel: "shock", partsCount: 2 },
      ],
    };
    expect(() => batchCreateSchema.parse(input)).not.toThrow();
  });

  it("accepts previously_published toggle", () => {
    expect(() =>
      toggleActivitySchema.parse({ partId: "CPP-1", activity: "previously_published", isDone: true, expectedProductVersion: 1 }),
    ).not.toThrow();
  });

  it("validates updateMetadataSchema requires expectedVersion", () => {
    expect(() => updateMetadataSchema.parse({ title: "New" })).toThrow();
    expect(() => updateMetadataSchema.parse({ title: "New", expectedVersion: 1 })).not.toThrow();
  });

  it("rejects invalid productType in batch", () => {
    const input = { products: [{ title: "T", productType: "invalid_type", channel: "tamashin", partsCount: 1 }] };
    expect(() => batchCreateSchema.parse(input)).toThrow();
  });

  it("rejects toggle with invalid activity", () => {
    expect(() =>
      toggleActivitySchema.parse({ partId: "CPP-1", activity: "invalid_act", isDone: true, expectedProductVersion: 1 }),
    ).toThrow();
  });
});
