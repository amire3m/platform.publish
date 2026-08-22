import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { db } from "@/db";
import { workflowNotifications } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(req: Request) {
  const { user, response } = await requirePermission("view_workflow");
  if (!user) return response!;
  const userId = (user as unknown as { id: string }).id;
  let body: { id?: string; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    if (body.all) {
      await db
        .update(workflowNotifications)
        .set({ readAt: new Date(), updatedAt: new Date() } as never)
        .where(and(eq(workflowNotifications.recipientUserId, userId), isNull(workflowNotifications.readAt)) as never);
      return jsonOk({ updated: true });
    }
    if (body.id) {
      const [row] = await db.select().from(workflowNotifications).where(eq(workflowNotifications.id, body.id)).limit(1);
      if (!row) return jsonError("یافت نشد", 404);
      if ((row as unknown as { recipientUserId: string }).recipientUserId !== userId) {
        return jsonError("دسترسی غیرمجاز", 403);
      }
      await db
        .update(workflowNotifications)
        .set({ readAt: new Date(), updatedAt: new Date() } as never)
        .where(eq(workflowNotifications.id, body.id) as never);
      return jsonOk({ updated: true });
    }
    return jsonError("شناسه نامعتبر", 422);
  } catch (err) {
    return jsonError((err as Error).message ?? "خطا", 500);
  }
}
