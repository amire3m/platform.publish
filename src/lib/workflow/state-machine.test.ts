import { describe, expect, it } from "vitest";

import {
  transitionProduction,
  transitionPublication,
} from "./state-machine";

describe("production state transitions", () => {
  it.each([
    ["not_started", "start", "assignee", "in_progress"],
    ["not_started", "start", "manager", "in_progress"],
    ["in_progress", "submit_review", "assignee", "ready_for_review"],
    ["changes_requested", "submit_review", "manager", "ready_for_review"],
    ["ready_for_review", "approve", "manager", "ready"],
  ] as const)(
    "allows %s --%s--> %s for %s",
    (status, action, actor, expectedStatus) => {
      expect(transitionProduction({ status, action, actor })).toEqual({
        status: expectedStatus,
      });
    },
  );

  it("requires a nonblank reason when review requests changes", () => {
    expect(() =>
      transitionProduction({
        status: "ready_for_review",
        action: "request_changes",
        actor: "manager",
        reason: "   ",
      }),
    ).toThrowError(/دلیل/);
  });

  it.each([
    ["request_changes", "ready_for_review", "changes_requested"],
    ["reopen", "ready", "in_progress"],
    ["cancel", "in_progress", "cancelled"],
    ["restore", "cancelled", "not_started"],
  ] as const)(
    "allows manager action %s with a reason",
    (action, status, expectedStatus) => {
      expect(
        transitionProduction({
          status,
          action,
          actor: "manager",
          reason: "دلیل معتبر",
        }),
      ).toEqual({ status: expectedStatus });
    },
  );

  it.each(["scheduled", "publishing", "published"] as const)(
    "blocks reopening ready production while a publication is %s",
    (publicationStatus) => {
      expect(() =>
        transitionProduction({
          status: "ready",
          action: "reopen",
          actor: "manager",
          reason: "نیاز به بازکاری",
          publicationStatuses: [publicationStatus],
        }),
      ).toThrowError(
        expect.objectContaining({ code: "INVALID_TRANSITION" }),
      );
    },
  );

  it.each(["scheduled", "publishing", "published"] as const)(
    "blocks cancellation while a publication is %s",
    (publicationStatus) => {
      expect(() =>
        transitionProduction({
          status: "in_progress",
          action: "cancel",
          actor: "manager",
          reason: "توقف تولید",
          publicationStatuses: [publicationStatus],
        }),
      ).toThrowError(
        expect.objectContaining({ code: "INVALID_TRANSITION" }),
      );
    },
  );

  it("defaults omitted publication statuses to an empty list", () => {
    expect(
      transitionProduction({
        status: "ready",
        action: "reopen",
        actor: "manager",
        reason: "نیاز به بازکاری",
      }),
    ).toEqual({ status: "in_progress" });
  });

  it.each([
    ["not_started", "approve", "manager"],
    ["ready", "reopen", "assignee"],
    ["cancelled", "cancel", "manager"],
    ["cancelled", "restore", "publisher"],
  ] as const)(
    "rejects unlisted or unauthorized transition %s --%s--> for %s",
    (status, action, actor) => {
      expect(() =>
        transitionProduction({
          status,
          action,
          actor,
          reason: "دلیل معتبر",
        }),
      ).toThrowError(
        expect.objectContaining({ code: "INVALID_TRANSITION" }),
      );
    },
  );
});

describe("publication state transitions", () => {
  it.each([
    ["waiting_for_production", "prepare", "worker", "ready"],
    ["ready", "schedule", "publisher", "scheduled"],
    ["failed", "schedule", "manager", "scheduled"],
    ["ready", "claim_publish", "worker", "publishing"],
    ["scheduled", "claim_publish", "worker", "publishing"],
    ["failed", "claim_publish", "worker", "publishing"],
    ["publishing", "publish_failed", "worker", "failed"],
  ] as const)(
    "allows %s --%s--> %s for %s",
    (status, action, actor, expectedStatus) => {
      expect(
        transitionPublication({
          status,
          action,
          actor,
          productionStatus: "ready",
          automaticTargetReady: true,
        }),
      ).toEqual({ status: expectedStatus });
    },
  );

  it("marks a successful worker publication as automatically owned", () => {
    expect(
      transitionPublication({
        status: "publishing",
        action: "publish_succeeded",
        actor: "worker",
        productionStatus: "ready",
      }),
    ).toEqual({ status: "published", terminalOwner: "automatic" });
  });

  it("clears the schedule when a publisher cancels it", () => {
    expect(
      transitionPublication({
        status: "scheduled",
        action: "cancel_schedule",
        actor: "publisher",
        productionStatus: "ready",
      }),
    ).toEqual({ status: "ready", clearSchedule: true });
  });

  it("prevents scheduling before production is ready", () => {
    expect(() =>
      transitionPublication({
        status: "waiting_for_production",
        action: "schedule",
        productionStatus: "in_progress",
        actor: "publisher",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "PRODUCTION_NOT_READY",
        message: expect.stringMatching(/آماده انتشار/),
      }),
    );
  });

  it("requires a verified automatic target before scheduling", () => {
    expect(() =>
      transitionPublication({
        status: "ready",
        action: "schedule",
        productionStatus: "ready",
        actor: "publisher",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_TRANSITION" }),
    );
  });

  it.each([
    ["ready", false],
    ["scheduled", true],
    ["failed", false],
  ] as const)(
    "manually publishes %s and clearsSchedule=%s only when applicable",
    (status, clearSchedule) => {
      const result = transitionPublication({
        status,
        action: "manual_publish",
        productionStatus: "ready",
        actor: "publisher",
        publishedAt: "2026-08-22T12:00:00.000Z",
        reason: "انتشار دستی تأیید شد",
      });

      expect(result).toEqual(
        clearSchedule
          ? {
              status: "published",
              terminalOwner: "manual",
              clearSchedule: true,
            }
          : { status: "published", terminalOwner: "manual" },
      );
    },
  );

  it.each([
    [undefined, "انتشار دستی تأیید شد"],
    ["2026-08-22T12:00:00.000Z", "   "],
  ] as const)(
    "rejects manual publication with publishedAt=%s and reason=%s",
    (publishedAt, reason) => {
      expect(() =>
        transitionPublication({
          status: "ready",
          action: "manual_publish",
          productionStatus: "ready",
          actor: "manager",
          publishedAt,
          reason,
        }),
      ).toThrowError();
    },
  );

  it("suppresses an eligible destination with manual terminal ownership", () => {
    expect(
      transitionPublication({
        status: "scheduled",
        action: "suppress",
        productionStatus: "ready",
        actor: "publisher",
        reason: "این مقصد منتشر نشود",
      }),
    ).toEqual({
      status: "do_not_publish",
      terminalOwner: "manual",
      clearSchedule: true,
      resetTarget: "cancelled",
    });
  });

  it.each(["publishing", "published"] as const)(
    "does not suppress a destination in %s",
    (status) => {
      expect(() =>
        transitionPublication({
          status,
          action: "suppress",
          productionStatus: "ready",
          actor: "manager",
          reason: "این مقصد منتشر نشود",
        }),
      ).toThrowError(
        expect.objectContaining({ code: "INVALID_TRANSITION" }),
      );
    },
  );

  it.each([
    ["ready", "ready"],
    ["in_progress", "waiting_for_production"],
  ] as const)(
    "restores suppression to %s when production is %s",
    (productionStatus, expectedStatus) => {
      expect(
        transitionPublication({
          status: "do_not_publish",
          action: "restore_suppressed",
          productionStatus,
          actor: "manager",
          reason: "برنامه انتشار تغییر کرد",
        }),
      ).toEqual({
        status: expectedStatus,
        terminalOwner: null,
        resetTarget: "approved",
      });
    },
  );

  it.each(["manual", "imported"] as const)(
    "returns a %s publication to the active state and clears metadata",
    (terminalOwner) => {
      expect(
        transitionPublication({
          status: "published",
          action: "override_terminal_status",
          productionStatus: "ready",
          actor: "manager",
          reason: "اصلاح وضعیت نهایی",
          terminalOwner,
          overrideTo: "active",
        }),
      ).toEqual({
        status: "ready",
        terminalOwner: null,
        clearPublishedMetadata: true,
        resetTarget: "approved",
      });
    },
  );

  it("returns a manual publication to waiting when production is not ready", () => {
    expect(
      transitionPublication({
        status: "published",
        action: "override_terminal_status",
        productionStatus: "changes_requested",
        actor: "manager",
        reason: "اصلاح وضعیت نهایی",
        terminalOwner: "manual",
        overrideTo: "active",
      }),
    ).toEqual({
      status: "waiting_for_production",
      terminalOwner: null,
      clearPublishedMetadata: true,
      resetTarget: "approved",
    });
  });

  it("corrects a manual publication to do not publish", () => {
    expect(
      transitionPublication({
        status: "published",
        action: "override_terminal_status",
        productionStatus: "ready",
        actor: "manager",
        reason: "اصلاح وضعیت نهایی",
        terminalOwner: "imported",
        overrideTo: "do_not_publish",
      }),
    ).toEqual({
      status: "do_not_publish",
      terminalOwner: "manual",
      clearPublishedMetadata: true,
      resetTarget: "cancelled",
    });
  });

  it("restores do not publish only to the active state", () => {
    expect(
      transitionPublication({
        status: "do_not_publish",
        action: "override_terminal_status",
        productionStatus: "in_progress",
        actor: "manager",
        reason: "اصلاح وضعیت نهایی",
        terminalOwner: "manual",
        overrideTo: "active",
      }),
    ).toEqual({
      status: "waiting_for_production",
      terminalOwner: null,
      resetTarget: "approved",
    });
  });

  it.each([
    ["published", "automatic", "active"],
    ["published", null, "active"],
    ["do_not_publish", "manual", "do_not_publish"],
  ] as const)(
    "rejects invalid terminal override from %s owned by %s to %s",
    (status, terminalOwner, overrideTo) => {
      expect(() =>
        transitionPublication({
          status,
          action: "override_terminal_status",
          productionStatus: "ready",
          actor: "manager",
          reason: "اصلاح وضعیت نهایی",
          terminalOwner,
          overrideTo,
        }),
      ).toThrowError(
        expect.objectContaining({ code: "INVALID_TRANSITION" }),
      );
    },
  );

  it.each([
    ["suppress", "ready", "publisher"],
    ["restore_suppressed", "do_not_publish", "manager"],
    ["override_terminal_status", "published", "manager"],
  ] as const)(
    "requires a nonblank reason for %s",
    (action, status, actor) => {
      expect(() =>
        transitionPublication({
          status,
          action,
          productionStatus: "ready",
          actor,
          reason: "",
          terminalOwner: "manual",
          overrideTo: "active",
        }),
      ).toThrowError(expect.objectContaining({ code: "REASON_REQUIRED" }));
    },
  );

  it.each([
    ["ready", "schedule", "assignee"],
    ["publishing", "publish_succeeded", "publisher"],
    ["scheduled", "cancel_schedule", "worker"],
    ["do_not_publish", "restore_suppressed", "publisher"],
  ] as const)(
    "rejects unlisted or unauthorized transition %s --%s--> for %s",
    (status, action, actor) => {
      expect(() =>
        transitionPublication({
          status,
          action,
          productionStatus: "ready",
          actor,
          reason: "دلیل معتبر",
          automaticTargetReady: true,
        }),
      ).toThrowError(
        expect.objectContaining({ code: "INVALID_TRANSITION" }),
      );
    },
  );
});
