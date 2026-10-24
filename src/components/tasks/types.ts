import type { JobFunction } from "@/lib/job-functions";

export type TaskColumnKey = "open" | "awaiting_approval" | "completed" | "archived";

export interface TaskCardCapabilities {
  canEdit: boolean;
  canApprove: boolean;
  canReturn: boolean;
  canArchive: boolean;
}

export interface TaskCardAssignment {
  jobFunction: JobFunction;
  status: "open" | "submitted";
  submissionNote: string | null;
  submissionUrl: string | null;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  canSubmit: boolean;
}

export interface TaskCardItem {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  productId: string | null;
  productTitle: string | null;
  partId: string | null;
  partNumber: number | null;
  channel: string | null;
  version: number;
  awaitingApprovalAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  assignments: TaskCardAssignment[];
  capabilities: TaskCardCapabilities;
}

export interface TaskPageResponse {
  items: TaskCardItem[];
  nextCursor: string | null;
  total: number;
}

export interface TaskHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorUserId: string | null;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface TaskDetailResponse extends TaskCardItem {
  description: string | null;
  createdBy: string | null;
  createdByName: string | null;
  updatedAt: string;
  recentHistory: TaskHistoryEntry[];
}

export interface TaskBoardFilters {
  search: string;
  jobFunction: string;
  due: string;
  productId: string;
  completedMode: "recent" | "all" | "custom";
  completedFrom: string;
  completedTo: string;
}

export const DEFAULT_TASK_FILTERS: TaskBoardFilters = {
  search: "",
  jobFunction: "",
  due: "",
  productId: "",
  completedMode: "recent",
  completedFrom: "",
  completedTo: "",
};

export const TASK_COLUMN_LABELS: Record<TaskColumnKey, string> = {
  open: "باز",
  awaiting_approval: "منتظر تأیید",
  completed: "تکمیل‌شده",
  archived: "بایگانی",
};

