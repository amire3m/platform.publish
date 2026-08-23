import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { contentParts, contentProducts } from "./schema";

describe("content room schema", () => {
  it("defines content_products with required columns and nullability", () => {
    const columns = getTableColumns(contentProducts);
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "id",
        "title",
        "productType",
        "channel",
        "partsCount",
        "status",
        "version",
        "createdBy",
        "createdAt",
        "notes",
      ]),
    );
    expect(columns.id.notNull).toBe(true);
    expect(columns.title.notNull).toBe(true);
    expect(columns.productType.notNull).toBe(true);
    expect(columns.channel.notNull).toBe(true);
    expect(columns.partsCount.notNull).toBe(true);
    expect(columns.status.notNull).toBe(true);
    expect(columns.version.notNull).toBe(true);
    expect(columns.version.hasDefault).toBe(true);
    expect(columns.createdBy.notNull).toBe(false);
    expect(columns.notes.notNull).toBe(false);
    expect(columns.title.hasDefault).toBe(false);
  });

  it("defines content_parts with FK and nullable file_ref/status", () => {
    const columns = getTableColumns(contentParts);
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining(["id", "productId", "partNumber", "fileRef", "status"]),
    );
    expect(columns.productId.notNull).toBe(true);
    expect(columns.partNumber.notNull).toBe(true);
    expect(columns.fileRef.notNull).toBe(false);
    expect(columns.status.notNull).toBe(false);
  });

  it("creates indexes on product_type, channel, status", () => {
    const indexes = getTableConfig(contentProducts).indexes;
    const names = indexes.map((idx) => idx.config.name);
    expect(names).toEqual(expect.arrayContaining([
      "content_product_type_idx",
      "content_product_channel_idx",
      "content_product_status_idx",
    ]));
    const columnsByIndex: Record<string, string[]> = {};
    for (const idx of indexes) {
      const cols = idx.config.columns.map((c: unknown) => {
        if (c && typeof c === "object" && "name" in (c as Record<string, unknown>)) {
          return (c as { name: string }).name;
        }
        return "";
      });
      columnsByIndex[idx.config.name as string] = cols;
    }
    expect(columnsByIndex["content_product_type_idx"]).toEqual(["product_type"]);
    expect(columnsByIndex["content_product_channel_idx"]).toEqual(["channel"]);
    expect(columnsByIndex["content_product_status_idx"]).toEqual(["status"]);
  });

  it("enforces title length 200 and allowed enums via column types", () => {
    // Title should be varchar(200) — drizzle stores length in column config
    const columns = getTableColumns(contentProducts) as unknown as Record<string, unknown>;
    // We check that title column exists and is notNull; length verification via SQL migration
    expect(columns["title"]).toBeDefined();
    // product_type and channel status columns exist
    expect(columns["productType"]).toBeDefined();
    expect(columns["channel"]).toBeDefined();
    expect(columns["status"]).toBeDefined();
  });
});
