import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { generateEntityId } from "@/lib/ids";
import { taskAssignments, tasks } from "./schema";

describe("manual task board schema", () => {
  it("defines persistent task state and lifecycle timestamps", () => {
    const columns = getTableColumns(tasks);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "id",
        "title",
        "description",
        "status",
        "dueAt",
        "productId",
        "partId",
        "createdBy",
        "version",
        "awaitingApprovalAt",
        "completedAt",
        "archivedAt",
        "createdAt",
        "updatedAt",
      ]),
    );
    expect(columns.id.notNull).toBe(true);
    expect(columns.title.notNull).toBe(true);
    expect(columns.status.notNull).toBe(true);
    expect(columns.status.hasDefault).toBe(true);
    expect(columns.version.notNull).toBe(true);
    expect(columns.version.hasDefault).toBe(true);
  });

  it("stores one shared assignment per task and job function", () => {
    const columns = getTableColumns(taskAssignments);
    const config = getTableConfig(taskAssignments);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "taskId",
        "jobFunction",
        "status",
        "submissionNote",
        "submissionUrl",
        "submittedBy",
        "submittedAt",
      ]),
    );
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0].columns.map((column) => column.name)).toEqual(["task_id", "job_function"]);
  });

  it("indexes every board ordering and assignment lookup", () => {
    const taskIndexes = getTableConfig(tasks).indexes.map((index) => index.config.name);
    const assignmentIndexes = getTableConfig(taskAssignments).indexes.map((index) => index.config.name);

    expect(taskIndexes).toEqual(
      expect.arrayContaining([
        "task_open_order_idx",
        "task_approval_order_idx",
        "task_completed_order_idx",
        "task_archived_order_idx",
        "task_product_idx",
        "task_part_idx",
      ]),
    );
    expect(assignmentIndexes).toContain("task_assignment_job_status_idx");
  });

  it("generates human-readable task identifiers", () => {
    expect(generateEntityId("TSK")).toMatch(/^TSK-\d{4}-\d{6}$/);
  });
});
