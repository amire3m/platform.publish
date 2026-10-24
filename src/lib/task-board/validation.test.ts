import { describe, expect, it } from "vitest";

import {
  createTaskSchema,
  returnTaskSchema,
  submitAssignmentSchema,
  taskListQuerySchema,
  updateTaskSchema,
  versionActionSchema,
} from "./validation";

describe("task mutation validation", () => {
  it("normalizes valid creation input", () => {
    const parsed = createTaskSchema.parse({
      title: "  کاور قسمت پنجم  ",
      description: "  خروجی نهایی  ",
      dueAt: "2026-10-24T12:30:00.000Z",
      productId: "CPR-1",
      partId: "CPP-1",
      jobFunctions: ["graphic", "publisher_admin"],
    });

    expect(parsed).toEqual({
      title: "کاور قسمت پنجم",
      description: "خروجی نهایی",
      dueAt: "2026-10-24T12:30:00.000Z",
      productId: "CPR-1",
      partId: "CPP-1",
      jobFunctions: ["graphic", "publisher_admin"],
    });
  });

  it("rejects duplicate, empty, and unknown job functions", () => {
    expect(createTaskSchema.safeParse({ title: "کار", jobFunctions: [] }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "کار", jobFunctions: ["graphic", "graphic"] }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "کار", jobFunctions: ["director"] }).success).toBe(false);
  });

  it("accepts only bounded absolute HTTP submission links", () => {
    expect(submitAssignmentSchema.safeParse({ expectedVersion: 1, submissionUrl: "https://example.com/file" }).success).toBe(true);
    expect(submitAssignmentSchema.safeParse({ expectedVersion: 1, submissionUrl: "file:///tmp/a" }).success).toBe(false);
    expect(submitAssignmentSchema.safeParse({ expectedVersion: 1, submissionUrl: `https://x.test/${"a".repeat(2050)}` }).success).toBe(false);
  });

  it("requires a bounded return reason and unique submitted functions", () => {
    expect(returnTaskSchema.safeParse({ expectedVersion: 2, reason: " ", jobFunctions: ["graphic"] }).success).toBe(false);
    expect(returnTaskSchema.safeParse({ expectedVersion: 2, reason: "اصلاح شود", jobFunctions: ["graphic", "graphic"] }).success).toBe(false);
    expect(returnTaskSchema.safeParse({ expectedVersion: 2, reason: "اصلاح شود", jobFunctions: ["graphic"] }).success).toBe(true);
  });

  it("requires positive versions for every versioned mutation", () => {
    expect(versionActionSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ expectedVersion: -1, title: "عنوان" }).success).toBe(false);
  });
});

describe("task list validation", () => {
  it("coerces and bounds page size", () => {
    expect(taskListQuerySchema.parse({ column: "open", limit: "25" }).limit).toBe(25);
    expect(taskListQuerySchema.safeParse({ column: "open", limit: "101" }).success).toBe(false);
  });

  it("rejects reversed completed ranges and invalid columns", () => {
    expect(
      taskListQuerySchema.safeParse({
        column: "completed",
        completedFrom: "2026-10-25T00:00:00.000Z",
        completedTo: "2026-10-24T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(taskListQuerySchema.safeParse({ column: "deleted" }).success).toBe(false);
  });
});
