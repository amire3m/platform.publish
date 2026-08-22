import { describe, expect, it } from "vitest";

import { deriveProgramProgress, selectNextAction } from "./progress";
import type { WorkflowProgressDeliverable } from "./progress";

function deliverable(
  patch: Partial<WorkflowProgressDeliverable> = {},
): WorkflowProgressDeliverable {
  return {
    id: "d1",
    status: "not_started",
    createdAt: "2026-08-01T00:00:00.000Z",
    dueAt: null,
    statusChangedAt: null,
    archivedAt: null,
    publications: [],
    ...patch,
  };
}

describe("deriveProgramProgress", () => {
  it("counts production and active publication units", () => {
    expect(
      deriveProgramProgress([
        deliverable({
          status: "ready",
          publications: [
            {
              id: "p1",
              status: "published",
              createdAt: "2026-08-01T00:00:00.000Z",
            },
            {
              id: "p2",
              status: "ready",
              createdAt: "2026-08-01T00:00:00.000Z",
            },
            {
              id: "p3",
              status: "do_not_publish",
              createdAt: "2026-08-01T00:00:00.000Z",
            },
          ],
        }),
      ]),
    ).toEqual({
      completedUnits: 2,
      totalUnits: 3,
      percent: 67,
      complete: false,
      empty: false,
    });
  });

  it("excludes archived and cancelled deliverables", () => {
    expect(
      deriveProgramProgress([
        deliverable({ status: "cancelled" }),
        deliverable({ id: "d2", archivedAt: "2026-08-02T00:00:00.000Z" }),
      ]),
    ).toEqual({
      completedUnits: 0,
      totalUnits: 0,
      percent: 0,
      complete: false,
      empty: true,
    });
  });

  it("completes an active deliverable with no destinations when production is ready", () => {
    expect(deriveProgramProgress([deliverable({ status: "ready" })])).toEqual({
      completedUnits: 1,
      totalUnits: 1,
      percent: 100,
      complete: true,
      empty: false,
    });
  });
});

describe("selectNextAction", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");

  it("prioritizes changes requested and failed publications by oldest event", () => {
    const result = selectNextAction(
      [
        deliverable({
          id: "changes",
          status: "changes_requested",
          statusChangedAt: "2026-08-21T10:00:00.000Z",
          dueAt: "2026-08-20T00:00:00.000Z",
        }),
        deliverable({
          id: "failed-owner",
          publications: [
            {
              id: "failed",
              status: "failed",
              createdAt: "2026-08-01T00:00:00.000Z",
              statusChangedAt: "2026-08-20T10:00:00.000Z",
            },
          ],
        }),
      ],
      now,
    );

    expect(result).toMatchObject({
      kind: "publication_failed",
      deliverableId: "failed-owner",
      publicationId: "failed",
    });
  });

  it("chooses the most overdue incomplete item before future work", () => {
    const result = selectNextAction(
      [
        deliverable({
          id: "one-day-late",
          dueAt: "2026-08-21T12:00:00.000Z",
        }),
        deliverable({
          id: "three-days-late",
          dueAt: "2026-08-19T12:00:00.000Z",
        }),
      ],
      now,
    );

    expect(result).toMatchObject({
      kind: "overdue_production",
      deliverableId: "three-days-late",
    });
  });

  it("selects the nearest ready destination before future production", () => {
    const result = selectNextAction(
      [
        deliverable({
          id: "ready-output",
          status: "ready",
          dueAt: "2026-08-24T00:00:00.000Z",
          publications: [
            {
              id: "later",
              status: "ready",
              scheduledAt: "2026-08-24T00:00:00.000Z",
              createdAt: "2026-08-01T00:00:00.000Z",
            },
            {
              id: "sooner",
              status: "ready",
              scheduledAt: "2026-08-23T00:00:00.000Z",
              createdAt: "2026-08-02T00:00:00.000Z",
            },
          ],
        }),
        deliverable({
          id: "future-production",
          status: "in_progress",
          dueAt: "2026-08-22T18:00:00.000Z",
        }),
      ],
      now,
    );

    expect(result).toMatchObject({
      kind: "publication_ready",
      publicationId: "sooner",
    });
  });

  it("uses createdAt then id as a stable tie-break with null deadlines last", () => {
    const result = selectNextAction(
      [
        deliverable({ id: "null-date", createdAt: "2026-07-01T00:00:00.000Z" }),
        deliverable({
          id: "b",
          createdAt: "2026-08-01T00:00:00.000Z",
          dueAt: "2026-08-24T00:00:00.000Z",
        }),
        deliverable({
          id: "a",
          createdAt: "2026-08-01T00:00:00.000Z",
          dueAt: "2026-08-24T00:00:00.000Z",
        }),
      ],
      now,
    );

    expect(result).toMatchObject({
      kind: "production_due",
      deliverableId: "a",
    });
  });
});
