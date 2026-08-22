import type { ProductionStatus, PublicationStatus } from "./types";

export interface WorkflowProgressPublication {
  id: string;
  status: PublicationStatus;
  createdAt: string | Date;
  statusChangedAt?: string | Date | null;
  scheduledAt?: string | Date | null;
}

export interface WorkflowProgressDeliverable {
  id: string;
  status: ProductionStatus;
  createdAt: string | Date;
  statusChangedAt?: string | Date | null;
  dueAt?: string | Date | null;
  archivedAt?: string | Date | null;
  publications: WorkflowProgressPublication[];
}

export interface ProgramProgress {
  completedUnits: number;
  totalUnits: number;
  percent: number;
  complete: boolean;
  empty: boolean;
}

export type WorkflowNextActionKind =
  | "changes_requested"
  | "publication_failed"
  | "overdue_production"
  | "overdue_publication"
  | "publication_ready"
  | "production_due";

export interface WorkflowNextAction {
  kind: WorkflowNextActionKind;
  deliverableId: string;
  publicationId?: string;
  at: string | Date | null;
}

interface RankedAction extends WorkflowNextAction {
  priority: number;
  createdAt: string | Date;
  stableId: string;
}

export function deriveProgramProgress(
  deliverables: WorkflowProgressDeliverable[],
): ProgramProgress {
  let completedUnits = 0;
  let totalUnits = 0;

  for (const deliverable of activeDeliverables(deliverables)) {
    totalUnits += 1;
    if (deliverable.status === "ready") completedUnits += 1;

    for (const publication of deliverable.publications) {
      if (publication.status === "do_not_publish") continue;
      totalUnits += 1;
      if (publication.status === "published") completedUnits += 1;
    }
  }

  const empty = totalUnits === 0;
  return {
    completedUnits,
    totalUnits,
    percent: empty ? 0 : Math.round((completedUnits / totalUnits) * 100),
    complete: !empty && completedUnits === totalUnits,
    empty,
  };
}

export function selectNextAction(
  deliverables: WorkflowProgressDeliverable[],
  now: Date,
): WorkflowNextAction | null {
  const candidates: RankedAction[] = [];
  const nowTime = now.getTime();

  for (const deliverable of activeDeliverables(deliverables)) {
    if (deliverable.status === "changes_requested") {
      candidates.push({
        kind: "changes_requested",
        deliverableId: deliverable.id,
        at: deliverable.statusChangedAt ?? deliverable.createdAt,
        priority: 1,
        createdAt: deliverable.createdAt,
        stableId: deliverable.id,
      });
    }

    if (
      deliverable.status !== "ready" &&
      isPast(deliverable.dueAt, nowTime)
    ) {
      candidates.push({
        kind: "overdue_production",
        deliverableId: deliverable.id,
        at: deliverable.dueAt ?? null,
        priority: 2,
        createdAt: deliverable.createdAt,
        stableId: deliverable.id,
      });
    }

    if (
      deliverable.status === "not_started" ||
      deliverable.status === "in_progress"
    ) {
      candidates.push({
        kind: "production_due",
        deliverableId: deliverable.id,
        at: deliverable.dueAt ?? null,
        priority: 4,
        createdAt: deliverable.createdAt,
        stableId: deliverable.id,
      });
    }

    for (const publication of deliverable.publications) {
      if (
        publication.status === "published" ||
        publication.status === "do_not_publish"
      ) {
        continue;
      }

      const publicationDue = publication.scheduledAt ?? deliverable.dueAt ?? null;
      if (publication.status === "failed") {
        candidates.push({
          kind: "publication_failed",
          deliverableId: deliverable.id,
          publicationId: publication.id,
          at: publication.statusChangedAt ?? publication.createdAt,
          priority: 1,
          createdAt: publication.createdAt,
          stableId: publication.id,
        });
      }

      if (isPast(publicationDue, nowTime)) {
        candidates.push({
          kind: "overdue_publication",
          deliverableId: deliverable.id,
          publicationId: publication.id,
          at: publicationDue,
          priority: 2,
          createdAt: publication.createdAt,
          stableId: publication.id,
        });
      }

      if (
        deliverable.status === "ready" &&
        (publication.status === "ready" ||
          publication.status === "waiting_for_production")
      ) {
        candidates.push({
          kind: "publication_ready",
          deliverableId: deliverable.id,
          publicationId: publication.id,
          at: publicationDue,
          priority: 3,
          createdAt: publication.createdAt,
          stableId: publication.id,
        });
      }
    }
  }

  candidates.sort(compareActions);
  const selected = candidates[0];
  if (!selected) return null;

  const { priority: _priority, createdAt: _createdAt, stableId: _stableId, ...action } = selected;
  return action;
}

function activeDeliverables(
  deliverables: WorkflowProgressDeliverable[],
): WorkflowProgressDeliverable[] {
  return deliverables.filter(
    (deliverable) =>
      deliverable.status !== "cancelled" && !deliverable.archivedAt,
  );
}

function compareActions(left: RankedAction, right: RankedAction): number {
  return (
    left.priority - right.priority ||
    compareDates(left.at, right.at) ||
    compareDates(left.createdAt, right.createdAt) ||
    left.stableId.localeCompare(right.stableId, "en")
  );
}

function compareDates(
  left: string | Date | null,
  right: string | Date | null,
): number {
  return toTime(left) - toTime(right);
}

function isPast(value: string | Date | null | undefined, now: number): boolean {
  const time = toTime(value ?? null);
  return Number.isFinite(time) && time < now;
}

function toTime(value: string | Date | null): number {
  if (value === null) return Number.POSITIVE_INFINITY;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
