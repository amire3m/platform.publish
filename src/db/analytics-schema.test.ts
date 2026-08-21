import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { analyticsSnapshots, appSettings, socialAccounts } from "./schema";

describe("analytics schema", () => {
  it("defines snapshot scope and content metadata with the required nullability", () => {
    const columns = getTableColumns(analyticsSnapshots);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "scopeType",
        "scopeId",
        "contentTitle",
        "thumbnailUrl",
        "publishedAt",
        "subscribersGained",
        "subscribersLost",
      ]),
    );
    expect(columns.scopeType.notNull).toBe(true);
    expect(columns.scopeId.notNull).toBe(true);
    expect(columns.contentTitle.notNull).toBe(false);
    expect(columns.thumbnailUrl.notNull).toBe(false);
    expect(columns.publishedAt.notNull).toBe(false);
    expect(columns.subscribersGained.notNull).toBe(false);
    expect(columns.subscribersLost.notNull).toBe(false);
  });

  it("defines exactly one unique daily scope index in key order", () => {
    const uniqueIndexes = getTableConfig(analyticsSnapshots).indexes.filter(
      (index) => index.config.unique,
    );

    expect(uniqueIndexes).toHaveLength(1);
    expect(uniqueIndexes[0]?.config.name).toBe("analytics_snapshot_daily_scope_unique");
    expect(
      uniqueIndexes[0]?.config.columns.map((column) =>
        "name" in column ? column.name : undefined,
      ),
    ).toEqual(["platform", "account_id", "scope_type", "scope_id", "date_utc"]);
  });

  it("defines nullable account lease and scheduler columns", () => {
    const accountColumns = getTableColumns(socialAccounts);
    const settingsColumns = getTableColumns(appSettings);

    expect(Object.keys(accountColumns)).toEqual(
      expect.arrayContaining([
        "analyticsSyncLockedAt",
        "analyticsSyncLockId",
        "analyticsSyncedThrough",
        "analyticsLastErrorCode",
        "analyticsNextAttemptAt",
      ]),
    );
    expect(accountColumns.analyticsSyncLockedAt.notNull).toBe(false);
    expect(accountColumns.analyticsSyncLockId.notNull).toBe(false);
    expect(accountColumns.analyticsSyncedThrough.notNull).toBe(false);
    expect(accountColumns.analyticsLastErrorCode.notNull).toBe(false);
    expect(accountColumns.analyticsNextAttemptAt.notNull).toBe(false);
    expect(Object.keys(settingsColumns)).toContain("lastAnalyticsRunAt");
    expect(settingsColumns.lastAnalyticsRunAt.notNull).toBe(false);
  });
});
