export type ProductionStatus =
  | "not_started"
  | "in_progress"
  | "ready_for_review"
  | "changes_requested"
  | "ready"
  | "cancelled";

export type PublicationStatus =
  | "waiting_for_production"
  | "ready"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "do_not_publish";

export type WorkflowActor = "assignee" | "publisher" | "manager" | "worker";

export type TerminalOwner = "automatic" | "manual" | "imported";

export type ProductionAction =
  | "start"
  | "submit_review"
  | "request_changes"
  | "approve"
  | "reopen"
  | "cancel"
  | "restore";

export type PublicationAction =
  | "prepare"
  | "schedule"
  | "claim_publish"
  | "publish_succeeded"
  | "publish_failed"
  | "cancel_schedule"
  | "suppress"
  | "restore_suppressed"
  | "manual_publish"
  | "override_terminal_status";

export interface ProductionTransitionInput {
  status: ProductionStatus;
  action: ProductionAction;
  actor: WorkflowActor;
  reason?: string;
  publicationStatuses?: PublicationStatus[];
}

export interface PublicationTransitionInput {
  status: PublicationStatus;
  action: PublicationAction;
  productionStatus: ProductionStatus;
  actor: WorkflowActor;
  reason?: string;
  automaticTargetReady?: boolean;
  publishedAt?: string;
  terminalOwner?: TerminalOwner | null;
  overrideTo?: "active" | "do_not_publish";
}

export interface WorkflowTransitionResult {
  status: ProductionStatus | PublicationStatus;
  terminalOwner?: TerminalOwner | null;
  clearSchedule?: boolean;
  clearPublishedMetadata?: boolean;
  resetTarget?: "approved" | "cancelled";
}

export class WorkflowActionError extends Error {
  constructor(
    public code:
      | "INVALID_TRANSITION"
      | "REASON_REQUIRED"
      | "PRODUCTION_NOT_READY",
    message: string,
  ) {
    super(message);
    this.name = "WorkflowActionError";
  }
}
