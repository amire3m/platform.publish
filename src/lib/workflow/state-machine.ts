import {
  WorkflowActionError,
  type ProductionStatus,
  type ProductionTransitionInput,
  type PublicationStatus,
  type PublicationTransitionInput,
  type WorkflowActor,
  type WorkflowTransitionResult,
} from "./types";

export { WorkflowActionError } from "./types";
export type {
  ProductionStatus,
  ProductionTransitionInput,
  PublicationStatus,
  PublicationTransitionInput,
  WorkflowTransitionResult,
} from "./types";

const INVALID_TRANSITION_MESSAGE = "این گذار وضعیت مجاز نیست.";
const REASON_REQUIRED_MESSAGE = "ارائه دلیل برای این اقدام الزامی است.";
const PRODUCTION_NOT_READY_MESSAGE = "تولید هنوز آماده انتشار نیست.";

function invalidTransition(): never {
  throw new WorkflowActionError(
    "INVALID_TRANSITION",
    INVALID_TRANSITION_MESSAGE,
  );
}

function requireActor(actor: WorkflowActor, allowed: WorkflowActor[]): void {
  if (!allowed.includes(actor)) {
    invalidTransition();
  }
}

function requireReason(reason: string | undefined): void {
  if (!reason?.trim()) {
    throw new WorkflowActionError("REASON_REQUIRED", REASON_REQUIRED_MESSAGE);
  }
}

function requireReadyProduction(status: ProductionStatus): void {
  if (status !== "ready") {
    throw new WorkflowActionError(
      "PRODUCTION_NOT_READY",
      PRODUCTION_NOT_READY_MESSAGE,
    );
  }
}

function activePublicationStatus(
  productionStatus: ProductionStatus,
): "ready" | "waiting_for_production" {
  return productionStatus === "ready" ? "ready" : "waiting_for_production";
}

export function transitionProduction(
  input: ProductionTransitionInput,
): WorkflowTransitionResult {
  const publicationStatuses = input.publicationStatuses ?? [];

  switch (input.action) {
    case "start":
      requireActor(input.actor, ["assignee", "manager"]);
      if (input.status !== "not_started") invalidTransition();
      return { status: "in_progress" };

    case "submit_review":
      requireActor(input.actor, ["assignee", "manager"]);
      if (
        input.status !== "in_progress" &&
        input.status !== "changes_requested"
      ) {
        invalidTransition();
      }
      return { status: "ready_for_review" };

    case "request_changes":
      requireActor(input.actor, ["manager"]);
      requireReason(input.reason);
      if (input.status !== "ready_for_review") invalidTransition();
      return { status: "changes_requested" };

    case "approve":
      requireActor(input.actor, ["manager"]);
      if (input.status !== "ready_for_review") invalidTransition();
      return { status: "ready" };

    case "reopen":
      requireActor(input.actor, ["manager"]);
      requireReason(input.reason);
      if (
        input.status !== "ready" ||
        publicationStatuses.some((status) =>
          ["scheduled", "publishing", "published"].includes(status),
        )
      ) {
        invalidTransition();
      }
      return { status: "in_progress" };

    case "cancel":
      requireActor(input.actor, ["manager"]);
      requireReason(input.reason);
      if (
        input.status === "cancelled" ||
        publicationStatuses.some((status) =>
          ["scheduled", "publishing", "published"].includes(status),
        )
      ) {
        invalidTransition();
      }
      return { status: "cancelled" };

    case "restore":
      requireActor(input.actor, ["manager"]);
      requireReason(input.reason);
      if (input.status !== "cancelled") invalidTransition();
      return { status: "not_started" };
  }
}

export function transitionPublication(
  input: PublicationTransitionInput,
): WorkflowTransitionResult {
  switch (input.action) {
    case "prepare":
      requireActor(input.actor, ["worker"]);
      requireReadyProduction(input.productionStatus);
      if (input.status !== "waiting_for_production") invalidTransition();
      return { status: "ready" };

    case "schedule":
      requireActor(input.actor, ["publisher", "manager"]);
      requireReadyProduction(input.productionStatus);
      if (
        (input.status !== "ready" && input.status !== "failed") ||
        !input.automaticTargetReady
      ) {
        invalidTransition();
      }
      return { status: "scheduled" };

    case "claim_publish":
      requireActor(input.actor, ["worker"]);
      requireReadyProduction(input.productionStatus);
      if (
        input.status !== "ready" &&
        input.status !== "scheduled" &&
        input.status !== "failed"
      ) {
        invalidTransition();
      }
      return { status: "publishing" };

    case "publish_succeeded":
      requireActor(input.actor, ["worker"]);
      if (input.status !== "publishing") invalidTransition();
      return { status: "published", terminalOwner: "automatic" };

    case "publish_failed":
      requireActor(input.actor, ["worker"]);
      if (input.status !== "publishing") invalidTransition();
      return { status: "failed" };

    case "cancel_schedule":
      requireActor(input.actor, ["publisher", "manager"]);
      if (input.status !== "scheduled") invalidTransition();
      return { status: "ready", clearSchedule: true };

    case "suppress": {
      requireActor(input.actor, ["publisher", "manager"]);
      requireReason(input.reason);
      if (input.status === "publishing" || input.status === "published") {
        invalidTransition();
      }

      const result: WorkflowTransitionResult = {
        status: "do_not_publish",
        terminalOwner: "manual",
        resetTarget: "cancelled",
      };
      if (input.status === "scheduled") result.clearSchedule = true;
      return result;
    }

    case "restore_suppressed":
      requireActor(input.actor, ["manager"]);
      requireReason(input.reason);
      if (input.status !== "do_not_publish") invalidTransition();
      return {
        status: activePublicationStatus(input.productionStatus),
        terminalOwner: null,
        resetTarget: "approved",
      };

    case "manual_publish": {
      requireActor(input.actor, ["publisher", "manager"]);
      requireReadyProduction(input.productionStatus);
      requireReason(input.reason);
      if (
        !input.publishedAt?.trim() ||
        (input.status !== "ready" &&
          input.status !== "scheduled" &&
          input.status !== "failed")
      ) {
        invalidTransition();
      }

      const result: WorkflowTransitionResult = {
        status: "published",
        terminalOwner: "manual",
      };
      if (input.status === "scheduled") result.clearSchedule = true;
      return result;
    }

    case "override_terminal_status":
      requireActor(input.actor, ["manager"]);
      requireReason(input.reason);

      if (input.status === "published") {
        if (
          (input.terminalOwner !== "manual" &&
            input.terminalOwner !== "imported") ||
          !input.overrideTo
        ) {
          invalidTransition();
        }

        if (input.overrideTo === "do_not_publish") {
          return {
            status: "do_not_publish",
            terminalOwner: "manual",
            clearPublishedMetadata: true,
            resetTarget: "cancelled",
          };
        }

        return {
          status: activePublicationStatus(input.productionStatus),
          terminalOwner: null,
          clearPublishedMetadata: true,
          resetTarget: "approved",
        };
      }

      if (
        input.status === "do_not_publish" &&
        input.overrideTo === "active"
      ) {
        return {
          status: activePublicationStatus(input.productionStatus),
          terminalOwner: null,
          resetTarget: "approved",
        };
      }

      return invalidTransition();
  }
}
