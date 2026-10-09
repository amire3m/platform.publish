import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, workflowEvents } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

/** Toggle history of one part: who did what, when, with what report note. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const subject = {
    role: (user as unknown as { role: string }).role,
    allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
    allowedAccountIds: (user as unknown as { allowedAccountIds?: string[] }).allowedAccountIds ?? [],
  };
  if (!hasPermission(subject, "manage_content_room") && !hasPermission(subject, "update_assigned_content")) {
    return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  }
  const { id: partId } = await ctx.params;
  const rows = (await db
    .select({
      id: workflowEvents.id,
      action: workflowEvents.action,
      after: workflowEvents.after,
      actorUserId: workflowEvents.actorUserId,
      createdAt: workflowEvents.createdAt,
    })
    .from(workflowEvents)
    .where(and(eq(workflowEvents.entityType, "content_part"), eq(workflowEvents.entityId, partId), eq(workflowEvents.action, "activity_toggled")))
    .orderBy(desc(workflowEvents.createdAt))
    .limit(100)) as unknown as Array<{
    id: string;
    action: string;
    after: { activity?: string; isDone?: boolean; note?: string | null } | null;
    actorUserId: string | null;
    createdAt: Date | string;
  }>;
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (actorIds.length) {
    const userRows = (await db.select({ id: users.id, name: users.name }).from(users)) as unknown as Array<{ id: string; name: string }>;
    for (const u of userRows) nameById.set(u.id, u.name);
  }
  return jsonOk({
    history: rows.map((r) => ({
      id: r.id,
      activity: r.after?.activity ?? null,
      isDone: r.after?.isDone ?? null,
      note: r.after?.note ?? null,
      actorUserId: r.actorUserId,
      actorName: r.actorUserId ? (nameById.get(r.actorUserId) ?? r.actorUserId) : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    })),
  });
}
