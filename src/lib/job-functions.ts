/**
 * Job functions (سمت شغلی): what a staff member DOES, distinct from the
 * system role (owner/manager/editor/...) which controls what they MAY do.
 * A user can hold several job functions; their task queue is the union.
 */

export const JOB_FUNCTIONS = [
  "full_editor",
  "reel_editor",
  "graphic",
  "publisher_admin",
] as const;

export type JobFunction = (typeof JOB_FUNCTIONS)[number];

export const JOB_FUNCTION_LABELS_FA: Record<JobFunction, string> = {
  full_editor: "تدوینگر ویدیوی کامل",
  reel_editor: "تدوینگر ریلز و برش",
  graphic: "گرافیست",
  publisher_admin: "ادمین انتشار",
};

export function jobFunctionLabelFa(value: string | null | undefined): string {
  if (!value) return "—";
  return (JOB_FUNCTION_LABELS_FA as Record<string, string>)[value] ?? value;
}

export function normalizeJobFunctions(value: unknown): JobFunction[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(JOB_FUNCTIONS);
  return [...new Set(value.filter((v): v is JobFunction => typeof v === "string" && allowed.has(v)))];
}
