import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  workflowDeliverables,
  workflowEvents,
  workflowImportBatches,
  workflowNotifications,
  workflowPrograms,
  workflowPublications,
  workflowTemplateItems,
  workflowTemplates,
} from "./schema";

describe("workflow schema", () => {
  it("defines all normalized workflow tables", () => {
    expect(Object.keys(getTableColumns(workflowPrograms))).toEqual(
      expect.arrayContaining(["title", "ownerUserId", "dueAt", "source", "version", "archivedAt"]),
    );
    expect(Object.keys(getTableColumns(workflowDeliverables))).toEqual(
      expect.arrayContaining(["programId", "productionStatus", "assigneeUserId", "contentId", "version"]),
    );
    expect(Object.keys(getTableColumns(workflowPublications))).toEqual(
      expect.arrayContaining(["deliverableId", "platform", "socialAccountId", "terminalOwner", "scheduledAt", "version"]),
    );
    expect(Object.keys(getTableColumns(workflowTemplates))).toContain("active");
    expect(Object.keys(getTableColumns(workflowTemplateItems))).toEqual(
      expect.arrayContaining(["templateId", "destinations", "dueOffsetMinutes"]),
    );
    expect(Object.keys(getTableColumns(workflowEvents))).toContain("reason");
    expect(Object.keys(getTableColumns(workflowNotifications))).toEqual(
      expect.arrayContaining(["idempotencyKey", "scheduledAt", "claimedAt", "readAt"]),
    );
    expect(Object.keys(getTableColumns(workflowImportBatches))).toContain("results");
  });

  it("defines account and accountless publication uniqueness", () => {
    const names = getTableConfig(workflowPublications).indexes
      .filter((index) => index.config.unique)
      .map((index) => index.config.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "workflow_publication_account_unique",
        "workflow_publication_accountless_unique",
      ]),
    );
  });

  it("keeps mutable workflow entities versioned", () => {
    for (const table of [workflowPrograms, workflowDeliverables, workflowPublications]) {
      const version = getTableColumns(table).version;
      expect(version.notNull).toBe(true);
      expect(version.hasDefault).toBe(true);
    }
  });
});
