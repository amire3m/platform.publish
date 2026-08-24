import { z } from "zod";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { commitWorkflowImport, ImportError } from "@/lib/workflow/import/import-service";
import { hasPermission, type PermissionSubject } from "@/lib/permissions";

const commitRowSchema = z.object({
  rowIndex: z.number().int().min(0),
  action: z.enum(["skip", "create", "update"]),
  programId: z.string().optional(),
  deliverableIds: z.record(z.string(), z.string()).optional(),
  mappedValues: z.record(z.string(), z.unknown()).optional(),
  skipCells: z.record(z.string(), z.boolean()).optional(),
  override: z.boolean().optional(),
  overrideReason: z.string().trim().max(2000).optional(),
});

export const commitRequestSchema = z.object({
  token: z.string().trim().min(1, "توکن پیش‌نمایش الزامی است."),
  rows: z.array(commitRowSchema).min(1),
});

export interface CommitRouteDependencies {
  requirePermission: typeof requirePermission;
  commitWorkflowImport: typeof commitWorkflowImport;
}

const defaultDeps: CommitRouteDependencies = {
  requirePermission,
  commitWorkflowImport,
};

function toSubject(user: { role: string; allowedActions?: string[] | null; allowedAccountIds?: string[] | null }): PermissionSubject {
  return { role: user.role, allowedActions: user.allowedActions ?? [], allowedAccountIds: user.allowedAccountIds ?? [] };
}

export async function handleCommitRequest(
  request: Request,
  deps: CommitRouteDependencies = defaultDeps,
): Promise<Response> {
  const { user, response } = await deps.requirePermission("import_workflow");
  if (!user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }

  const parsed = commitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "ورودی نامعتبر است.", 422, "VALIDATION_ERROR");
  }

  const subject = toSubject(user as unknown as { role: string; allowedActions?: string[]; allowedAccountIds?: string[] });
  const isManager = hasPermission(subject, "manage_programs") || subject.role === "manager" || subject.role === "owner";
  const actorUserId = (user as unknown as { id?: string }).id ?? "unknown";

  try {
    const result = await deps.commitWorkflowImport(
      {
        token: parsed.data.token,
        rows: parsed.data.rows as never,
        actorUserId,
        isManager,
      },
      undefined,
    );
    return jsonOk(result);
  } catch (e) {
    const code = (e as { code?: string }).code;
    const message = (e as Error).message ?? "خطای سرور";
    if (code === "INVALID_PREVIEW") return jsonError(message, 422, code);
    if (code === "PREVIEW_EXPIRED") return jsonError(message, 410, code);
    if (code === "PREVIEW_CONSUMED") return jsonError(message, 410, code);
    if (code === "PROGRAM_SELECTION_REQUIRED" || code === "DELIVERABLE_SELECTION_REQUIRED") return jsonError(message, 422, code);
    if (code === "UNKNOWN_CELL_REQUIRED") return jsonError(message, 422, code);
    if (code === "TERMINAL_OVERWRITE_BLOCKED" || code === "NEWER_VERSION_BLOCKED") return jsonError(message, 409, code);
    if (code === "IMPORT_FAILED") return jsonError(message, 500, code);
    if (code === "VALIDATION_ERROR") return jsonError(message, 422, code);
    // PreviewError codes mapped
    if (message.includes("منقضی")) return jsonError(message, 410, "PREVIEW_EXPIRED");
    if (code === "VERSION_CONFLICT") return jsonError(message, 409, code);
    console.error("[workflow-import-commit] failed:", e);
    return jsonError("ورود داده‌ها انجام نشد. دوباره تلاش کنید.", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleCommitRequest(request, defaultDeps);
}
