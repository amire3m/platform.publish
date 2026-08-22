import type { ProgramProgress, WorkflowNextAction } from "@/lib/workflow/progress";

export interface WorkflowProgramSummary {
  id: string;
  title: string;
  seriesName?: string | null;
  ownerUserId?: string | null;
  dueAt?: string | Date | null;
  notes?: string | null;
  progress: ProgramProgress;
  nextAction: WorkflowNextAction | null;
  needsAttention: boolean;
}

export interface WorkflowRoomFilters {
  attentionOnly: boolean;
  query: string;
}

export interface WorkflowProgramGroup {
  attention: WorkflowProgramSummary[];
  rest: WorkflowProgramSummary[];
}
