import { isChannelHidden } from "@/lib/channels";
import type { JobFunction } from "@/lib/job-functions";
import type { TaskAccessRecord, TaskActor, TaskCapabilities } from "./types";

const BROAD_READ_ROLES = new Set(["owner", "manager", "analyst", "publisher"]);

function canAccessChannel(actor: TaskActor, channel: string | null): boolean {
  if (!channel) return true;
  if (isChannelHidden(channel)) return false;
  if (actor.role === "owner" || actor.allowedChannels.length === 0) return true;
  return actor.allowedChannels.includes(channel);
}

export function canViewTask(actor: TaskActor, task: TaskAccessRecord): boolean {
  if (!actor.active || !canAccessChannel(actor, task.channel)) return false;
  if (BROAD_READ_ROLES.has(actor.role)) return true;
  return task.assignedJobFunctions.some((jobFunction) => actor.jobFunctions.includes(jobFunction));
}

export function canSubmitAssignment(actor: TaskActor, task: TaskAccessRecord, jobFunction: JobFunction): boolean {
  return (
    canViewTask(actor, task) &&
    task.status === "open" &&
    actor.jobFunctions.includes(jobFunction) &&
    task.assignedJobFunctions.includes(jobFunction) &&
    task.assignmentStatuses[jobFunction] === "open"
  );
}

export function getTaskCapabilities(actor: TaskActor, task: TaskAccessRecord): TaskCapabilities {
  const isOwner = actor.active && actor.role === "owner" && canViewTask(actor, task);
  const editable = task.status === "open" || task.status === "awaiting_approval";
  const hasSubmittedAssignment = Object.values(task.assignmentStatuses).includes("submitted");

  return {
    canEdit: isOwner && editable,
    canApprove: isOwner && task.status === "awaiting_approval",
    canReturn: isOwner && editable && hasSubmittedAssignment,
    canArchive: isOwner && task.status !== "archived",
  };
}

export function taskActorFromUser(user: {
  id: string;
  role: string;
  active: boolean;
  jobFunctions?: unknown;
  allowedChannels?: unknown;
}): TaskActor {
  return {
    id: user.id,
    role: user.role,
    active: user.active,
    jobFunctions: Array.isArray(user.jobFunctions) ? (user.jobFunctions as JobFunction[]) : [],
    allowedChannels: Array.isArray(user.allowedChannels) ? (user.allowedChannels as string[]) : [],
  };
}
