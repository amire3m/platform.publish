import { eq } from "drizzle-orm";
import { workflowPublications } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { rescheduleSchema } from "@/lib/validation";
import { isPast } from "@/lib/date/jalali";
import { schedulePublicationTarget, WorkflowTargetError } from "@/lib/workflow/target-service";

export async function PATCH(req: Request, { params }: { params: Promise<{ publicationId: string }> }) {
  const { user, response } = await requirePermission("schedule_content");
  if (!user) return response;
  const { publicationId } = await params;

  const parsed = rescheduleSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "داده نامعتبر است.", 422);

  if (isPast(parsed.data.scheduledAtUtc)) {
    return jsonError("امکان زمان‌بندی در گذشته وجود ندارد.", 400);
  }

  // fetch current version for optimistic concurrency
  const { db } = await import("@/db");
  const [existing] = await db.select().from(workflowPublications).where(eq(workflowPublications.id, publicationId)).limit(1);
  if (!existing) return jsonError("انتشار یافت نشد.", 404);
  const expectedVersion = (existing as unknown as { version: number }).version;

  try {
    const result = await schedulePublicationTarget(
      {
        publicationId,
        scheduledAtUtc: parsed.data.scheduledAtUtc,
        scheduledAtJalali: parsed.data.scheduledAtJalali,
        actorUserId: user.id,
        expectedVersion,
      },
    );
    return jsonOk(result);
  } catch (err) {
    if (err instanceof WorkflowTargetError) {
      if (err.code === "VERSION_CONFLICT") return jsonError(err.message, 409, err.code);
      if (err.code === "PRODUCTION_NOT_READY") return jsonError(err.message, 422, err.code);
      if (err.code === "ACCOUNT_FORBIDDEN") return jsonError(err.message, 403, err.code);
      if (err.code === "NOT_FOUND") return jsonError(err.message, 404, err.code);
      return jsonError(err.message, 400, err.code);
    }
    return jsonError((err as Error).message || "خطای ناشناخته", 500);
  }
}

// Export handler for testing with injected deps
export async function handleTargetRescheduleRequest(
  req: Request,
  ctx: { params: Promise<{ publicationId: string }> },
  deps: {
    getCurrentUser: () => Promise<null | { id: string; telegramId: string }>;
    scheduleTarget: typeof schedulePublicationTarget;
    getPublicationVersion: (id: string) => Promise<number | null>;
  },
) {
  const user = await deps.getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { publicationId } = await ctx.params;
  const parsed = rescheduleSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "داده نامعتبر است.", 422);
  if (isPast(parsed.data.scheduledAtUtc)) return jsonError("امکان زمان‌بندی در گذشته وجود ندارد.", 400);
  const version = await deps.getPublicationVersion(publicationId);
  if (version == null) return jsonError("انتشار یافت نشد.", 404);
  try {
    const result = await deps.scheduleTarget({
      publicationId,
      scheduledAtUtc: parsed.data.scheduledAtUtc,
      scheduledAtJalali: parsed.data.scheduledAtJalali,
      actorUserId: user.id,
      expectedVersion: version,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof WorkflowTargetError) {
      if (err.code === "VERSION_CONFLICT") return jsonError(err.message, 409, err.code);
      return jsonError(err.message, 400, err.code);
    }
    return jsonError((err as Error).message, 500);
  }
}
