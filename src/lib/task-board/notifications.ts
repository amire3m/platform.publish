import { DateTime } from "luxon";

import { generateEntityId } from "@/lib/ids";
import type { JobFunction } from "@/lib/job-functions";
import { canViewTask } from "./access";
import type { TaskAggregate, TaskNotificationRecord } from "./repository";
import type { TaskActor } from "./types";

export const TASK_NOTIFICATION_TYPES = [
  "task_created",
  "task_assignment_added",
  "task_assignment_submitted",
  "task_returned",
  "task_approved",
  "task_due_24h",
  "task_overdue",
] as const;

export type TaskNotificationType = (typeof TASK_NOTIFICATION_TYPES)[number];

const TEHRAN_ZONE = "Asia/Tehran";

export function isTaskNotificationType(eventType: string): boolean {
  return eventType.startsWith("task_");
}

export function buildTaskNotificationKey(input: {
  taskId: string;
  event: string;
  version: number | string;
  recipientUserId: string;
  jobFunction?: string;
}): string {
  const suffix = input.jobFunction ? `:${input.jobFunction}` : "";
  return `task:${input.taskId}:${input.event}:${input.version}:${input.recipientUserId}${suffix}`;
}

export function buildTaskDue24hKey(taskId: string, dueAtIso: string, recipientUserId: string, jobFunction: string): string {
  return `task:${taskId}:due_24h:${dueAtIso}:${recipientUserId}:${jobFunction}`;
}

export function tehranDayString(date: Date): string {
  return DateTime.fromJSDate(date).setZone(TEHRAN_ZONE).toFormat("yyyy-MM-dd");
}

export function tehranHour(date: Date): number {
  return Number(date.toLocaleString("en-US", { timeZone: TEHRAN_ZONE, hour: "numeric", hour12: false }));
}

export function buildTaskOverdueKey(taskId: string, tehranDay: string, recipientUserId: string, jobFunctionOrOwner: string): string {
  return `task:${taskId}:overdue:${tehranDay}:${recipientUserId}:${jobFunctionOrOwner}`;
}

export interface TaskNotificationPayloadInput {
  taskId: string;
  title: string;
  version?: number;
  jobFunction?: string;
  jobFunctions?: string[];
  dueAt?: string | null;
  reason?: string;
  [extra: string]: unknown;
}

const TASK_SAFE_PAYLOAD_KEYS = ["taskId", "title", "version", "jobFunction", "jobFunctions", "dueAt", "reason"];

export function buildTaskSafePayload(input: TaskNotificationPayloadInput): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of TASK_SAFE_PAYLOAD_KEYS) {
    if (input[key] !== undefined) safe[key] = input[key];
  }
  return safe;
}

export function buildTaskNotificationText(eventType: string, payload: Record<string, unknown>): string {
  const title = typeof payload.title === "string" && payload.title.length > 0 ? payload.title : "task";
  const job = typeof payload.jobFunction === "string" ? payload.jobFunction : "";
  const reason = typeof payload.reason === "string" && payload.reason.length > 0 ? payload.reason : "";
  switch (eventType) {
    case "task_created":
      return `📌 کار جدید «${title}» برای شما ثبت شد.`;
    case "task_assignment_added":
      return `📌 سمت جدید در کار «${title}»: ${job}`;
    case "task_assignment_submitted":
      return `📥 تحویل کار «${title}» ثبت شد: ${job}`;
    case "task_returned":
      return `↩️ کار «${title}» برای اصلاح برگشت داده شد. دلیل: ${reason}`;
    case "task_approved":
      return `✅ کار «${title}» تأیید شد.`;
    case "task_due_24h":
      return `⚠️ یادآوری سررسید: کار «${title}» تا ۲۴ ساعت دیگر سررسید دارد.`;
    case "task_overdue":
      return `⏰ تاخیر سررسید: کار «${title}» از موعد گذشته است.`;
    default:
      return `اعلان کار: ${eventType} — ${title}`;
  }
}

export interface TaskNotificationLike {
  eventType: string;
  payload: Record<string, unknown>;
  recipientUserId: string;
}

export interface TaskRecipientValidationDeps {
  getActor(userId: string): Promise<TaskActor | null>;
  getTaskAggregate(taskId: string): Promise<TaskAggregate | null>;
}

function accessRecord(aggregate: TaskAggregate) {
  return {
    status: aggregate.task.status,
    channel: aggregate.link.channel,
    assignedJobFunctions: aggregate.assignments.map((assignment) => assignment.jobFunction),
    assignmentStatuses: Object.fromEntries(
      aggregate.assignments.map((assignment) => [assignment.jobFunction, assignment.status]),
    ),
  };
}

export async function validateTaskNotificationRecipient(
  notification: TaskNotificationLike,
  deps: TaskRecipientValidationDeps,
  now: Date = new Date(),
): Promise<boolean> {
  const payload = notification.payload ?? {};
  const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
  if (!taskId) return false;
  const actor = await deps.getActor(notification.recipientUserId);
  if (!actor || !actor.active) return false;
  const aggregate = await deps.getTaskAggregate(taskId);
  if (!aggregate) return false;
  if (!canViewTask(actor, accessRecord(aggregate))) return false;

  const eventType = notification.eventType;
  const status = aggregate.task.status;
  if ((eventType === "task_due_24h" || eventType === "task_overdue") && (status === "archived" || status === "completed")) {
    return false;
  }

  const assignedJobs = aggregate.assignments.map((assignment) => assignment.jobFunction);
  const openJobs = new Set(
    aggregate.assignments.filter((assignment) => assignment.status === "open").map((assignment) => assignment.jobFunction),
  );

  switch (eventType) {
    case "task_assignment_submitted":
      return actor.role === "owner";
    case "task_assignment_added":
    case "task_returned": {
      const jobFunction = typeof payload.jobFunction === "string" ? payload.jobFunction : null;
      if (jobFunction) {
        return actor.jobFunctions.includes(jobFunction as JobFunction) && assignedJobs.includes(jobFunction as JobFunction);
      }
      return actor.jobFunctions.some((job) => assignedJobs.includes(job));
    }
    case "task_created":
    case "task_approved": {
      const jobs = Array.isArray(payload.jobFunctions) ? (payload.jobFunctions as string[]) : assignedJobs;
      return actor.jobFunctions.some((job) => (jobs as string[]).includes(job));
    }
    case "task_due_24h": {
      const jobFunction = typeof payload.jobFunction === "string" ? payload.jobFunction : null;
      const dueAt = typeof payload.dueAt === "string" ? payload.dueAt : null;
      if (!jobFunction || !dueAt) return false;
      const currentDue = aggregate.task.dueAt ? aggregate.task.dueAt.toISOString() : null;
      if (currentDue !== dueAt) return false;
      return actor.jobFunctions.includes(jobFunction as JobFunction) && openJobs.has(jobFunction as JobFunction);
    }
    case "task_overdue": {
      const marker = typeof payload.jobFunction === "string" ? payload.jobFunction : null;
      if (!marker) return false;
      const dueAt = aggregate.task.dueAt;
      if (!dueAt || dueAt.getTime() > now.getTime()) return false;
      if (marker === "owner") return actor.role === "owner" && openJobs.size > 0;
      return actor.jobFunctions.includes(marker as JobFunction) && openJobs.has(marker as JobFunction);
    }
    default:
      return true;
  }
}

export interface TaskReminderCandidate {
  taskId: string;
  title: string;
  dueAt: Date | null;
  status: string;
  channel: string | null;
  openJobFunctions: JobFunction[];
}

export interface TaskReminderPort {
  listReminderCandidates(): Promise<TaskReminderCandidate[]>;
  resolveJobRecipients(jobFunctions: JobFunction[], channel: string | null): Promise<TaskActor[]>;
  resolveOwners(): Promise<TaskActor[]>;
  insertTaskNotifications(rows: TaskNotificationRecord[]): Promise<number>;
}

export function buildTaskDue24hRow(input: {
  now: Date;
  taskId: string;
  title: string;
  version: number;
  dueAt: Date;
  recipientUserId: string;
  jobFunction: JobFunction;
}): TaskNotificationRecord {
  const dueAtIso = input.dueAt.toISOString();
  return {
    id: generateEntityId("WNT"),
    recipientUserId: input.recipientUserId,
    eventType: "task_due_24h",
    payload: buildTaskSafePayload({
      taskId: input.taskId,
      title: input.title,
      version: input.version,
      jobFunction: input.jobFunction,
      dueAt: dueAtIso,
    }),
    idempotencyKey: buildTaskDue24hKey(input.taskId, dueAtIso, input.recipientUserId, input.jobFunction),
    scheduledAt: new Date(input.dueAt.getTime() - 24 * 60 * 60 * 1000),
    status: "pending",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

const DUE_WINDOW_MS = 25 * 60 * 60 * 1000;

export async function scheduleTaskReminders(now: Date, deps: TaskReminderPort): Promise<{ enqueued: number }> {
  const candidates = await deps.listReminderCandidates();
  const rows: TaskNotificationRecord[] = [];

  for (const candidate of candidates) {
    if (!candidate.dueAt) continue;
    if (candidate.status === "completed" || candidate.status === "archived") continue;
    if (candidate.openJobFunctions.length === 0) continue;
    const diff = candidate.dueAt.getTime() - now.getTime();

    if (diff > 0 && diff <= DUE_WINDOW_MS && candidate.dueAt.getTime() - 24 * 60 * 60 * 1000 <= now.getTime()) {
      const dueAtIso = candidate.dueAt.toISOString();
      for (const jobFunction of candidate.openJobFunctions) {
        const recipients = await deps.resolveJobRecipients([jobFunction], candidate.channel);
        for (const recipient of recipients) {
          rows.push({
            id: generateEntityId("WNT"),
            recipientUserId: recipient.id,
            eventType: "task_due_24h",
            payload: buildTaskSafePayload({ taskId: candidate.taskId, title: candidate.title, jobFunction, dueAt: dueAtIso }),
            idempotencyKey: buildTaskDue24hKey(candidate.taskId, dueAtIso, recipient.id, jobFunction),
            scheduledAt: new Date(candidate.dueAt.getTime() - 24 * 60 * 60 * 1000),
            status: "pending",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    } else if (diff <= 0 && tehranHour(now) === 9) {
      const day = tehranDayString(now);
      const dueAtIso = candidate.dueAt.toISOString();
      for (const jobFunction of candidate.openJobFunctions) {
        const recipients = await deps.resolveJobRecipients([jobFunction], candidate.channel);
        for (const recipient of recipients) {
          rows.push({
            id: generateEntityId("WNT"),
            recipientUserId: recipient.id,
            eventType: "task_overdue",
            payload: buildTaskSafePayload({ taskId: candidate.taskId, title: candidate.title, jobFunction, dueAt: dueAtIso }),
            idempotencyKey: buildTaskOverdueKey(candidate.taskId, day, recipient.id, jobFunction),
            scheduledAt: now,
            status: "pending",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      const owners = await deps.resolveOwners();
      const seen = new Set<string>();
      for (const owner of owners) {
        if (seen.has(owner.id)) continue;
        seen.add(owner.id);
        rows.push({
          id: generateEntityId("WNT"),
          recipientUserId: owner.id,
          eventType: "task_overdue",
          payload: buildTaskSafePayload({ taskId: candidate.taskId, title: candidate.title, jobFunction: "owner", dueAt: dueAtIso }),
          idempotencyKey: buildTaskOverdueKey(candidate.taskId, day, owner.id, "owner"),
          scheduledAt: now,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  if (rows.length === 0) return { enqueued: 0 };
  const inserted = await deps.insertTaskNotifications(rows);
  return { enqueued: inserted };
}

export function createTaskNotificationVisibilityChecker(deps: {
  getTaskAggregate(taskId: string): Promise<TaskAggregate | null>;
}): (actor: TaskActor, row: { eventType: string; payload: Record<string, unknown> }) => Promise<boolean> {
  return async (actor, row) => {
    if (!isTaskNotificationType(row.eventType)) return true;
    const taskId = typeof row.payload.taskId === "string" ? row.payload.taskId : null;
    if (!taskId) return false;
    const aggregate = await deps.getTaskAggregate(taskId);
    if (!aggregate) return false;
    return canViewTask(actor, accessRecord(aggregate));
  };
}

