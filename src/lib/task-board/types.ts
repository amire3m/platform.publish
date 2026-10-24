import type { JobFunction } from "@/lib/job-functions";

export const TASK_STATUSES = ["open", "awaiting_approval", "completed", "archived"] as const;
export const TASK_COLUMNS = TASK_STATUSES;
export const TASK_ASSIGNMENT_STATUSES = ["open", "submitted"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskColumn = (typeof TASK_COLUMNS)[number];
export type TaskAssignmentStatus = (typeof TASK_ASSIGNMENT_STATUSES)[number];

export interface TaskActor {
  id: string;
  role: string;
  active: boolean;
  jobFunctions: JobFunction[];
  allowedChannels: string[];
}

export interface TaskCapabilities {
  canEdit: boolean;
  canApprove: boolean;
  canReturn: boolean;
  canArchive: boolean;
}

export interface TaskAccessRecord {
  status: TaskStatus;
  channel: string | null;
  assignedJobFunctions: JobFunction[];
  assignmentStatuses: Partial<Record<JobFunction, TaskAssignmentStatus>>;
}

export interface TaskAssignmentView {
  jobFunction: JobFunction;
  status: TaskAssignmentStatus;
  submissionNote: string | null;
  submissionUrl: string | null;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: Date | null;
  canSubmit: boolean;
}

export interface TaskCard {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt: Date | null;
  productId: string | null;
  productTitle: string | null;
  partId: string | null;
  partNumber: number | null;
  channel: string | null;
  version: number;
  awaitingApprovalAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  assignments: TaskAssignmentView[];
  capabilities: TaskCapabilities;
}

export interface TaskHistoryItem {
  id: string;
  entityType: "task" | "task_assignment";
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorUserId: string | null;
  actorName: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface TaskDetail extends TaskCard {
  description: string | null;
  createdBy: string | null;
  createdByName: string | null;
  updatedAt: Date;
  recentHistory: TaskHistoryItem[];
}

export interface TaskPage {
  items: TaskCard[];
  nextCursor: string | null;
  total: number;
}

export interface TaskHistoryPage {
  items: TaskHistoryItem[];
  nextCursor: string | null;
}

export interface ListTasksInput {
  actor: TaskActor;
  column: TaskColumn;
  search?: string;
  jobFunction?: JobFunction;
  due?: "overdue" | "today" | "week" | "none";
  productId?: string;
  completedFrom?: Date;
  completedTo?: Date;
  cursor?: string;
  limit: number;
}

export interface ListTaskHistoryInput {
  actor: TaskActor;
  taskId: string;
  cursor?: string;
  limit: number;
}

export interface CreateTaskInput {
  actor: TaskActor;
  title: string;
  description: string | null;
  dueAt: Date | null;
  productId: string | null;
  partId: string | null;
  jobFunctions: JobFunction[];
}

export interface UpdateTaskInput {
  actor: TaskActor;
  taskId: string;
  expectedVersion: number;
  title?: string;
  description?: string | null;
  dueAt?: Date | null;
  productId?: string | null;
  partId?: string | null;
  jobFunctions?: JobFunction[];
}

export interface SubmitAssignmentInput {
  actor: TaskActor;
  taskId: string;
  jobFunction: JobFunction;
  expectedVersion: number;
  submissionNote: string | null;
  submissionUrl: string | null;
}

export interface ReturnAssignmentsInput {
  actor: TaskActor;
  taskId: string;
  expectedVersion: number;
  jobFunctions: JobFunction[];
  reason: string;
}

export interface VersionedTaskActionInput {
  actor: TaskActor;
  taskId: string;
  expectedVersion: number;
}
