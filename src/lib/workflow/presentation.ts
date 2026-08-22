import type { ProductionStatus, PublicationStatus } from "./types";

export type WorkflowStatus = ProductionStatus | PublicationStatus;

export type WorkflowStatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export type WorkflowStatusIcon = "clock" | "loader" | "eye" | "alert" | "check" | "calendar" | "x";

export interface WorkflowStatusPresentation {
  label: string;
  tone: WorkflowStatusTone;
  icon: WorkflowStatusIcon;
}

const PRESENTATIONS: Record<WorkflowStatus, WorkflowStatusPresentation> = {
  not_started: { label: "شروع‌نشده", tone: "neutral", icon: "clock" },
  in_progress: { label: "در حال آماده‌سازی", tone: "warning", icon: "loader" },
  ready_for_review: { label: "آماده بازبینی", tone: "warning", icon: "eye" },
  changes_requested: { label: "اصلاح شود", tone: "danger", icon: "alert" },
  ready: { label: "آماده انتشار", tone: "info", icon: "clock" },
  cancelled: { label: "لغو شده", tone: "neutral", icon: "x" },
  waiting_for_production: { label: "منتظر آماده‌شدن", tone: "neutral", icon: "clock" },
  scheduled: { label: "زمان‌بندی‌شده", tone: "info", icon: "calendar" },
  publishing: { label: "در حال انتشار", tone: "info", icon: "loader" },
  published: { label: "منتشرشده", tone: "success", icon: "check" },
  failed: { label: "ناموفق", tone: "danger", icon: "alert" },
  do_not_publish: { label: "منتشر نشود", tone: "neutral", icon: "x" },
};

export function workflowStatusPresentation(status: WorkflowStatus): WorkflowStatusPresentation {
  return (
    PRESENTATIONS[status] ?? {
      label: status,
      tone: "neutral",
      icon: "clock",
    }
  );
}
