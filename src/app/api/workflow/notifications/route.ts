import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { db } from "@/db";
import { workflowNotifications } from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";

export async function GET(req: Request) {
  const { user, response } = await requirePermission("view_workflow");
  if (!user) return response!;
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const userId = (user as unknown as { id: string }).id;

  try {
    const conditions: unknown[] = [eq(workflowNotifications.recipientUserId, userId)];
    if (unreadOnly) conditions.push(isNull(workflowNotifications.readAt));
    const rows = await db
      .select()
      .from(workflowNotifications)
      .where(and(...(conditions as never[])))
      .orderBy(desc(workflowNotifications.createdAt))
      .limit(limit)
      .offset(offset);

    const unreadCountRows = await db
      .select()
      .from(workflowNotifications)
      .where(and(eq(workflowNotifications.recipientUserId, userId), isNull(workflowNotifications.readAt)));

    // Return with safe payload only (payload already safe)
    const safeRows = rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      payload: r.payload,
      status: r.status,
      readAt: r.readAt,
      createdAt: r.createdAt,
      // actionable links built from payload
      links: buildLinks(r.payload as Record<string, unknown>),
    }));

    return jsonOk({ items: safeRows, unreadCount: unreadCountRows.filter((r) => !r.readAt).length, total: safeRows.length });
  } catch (err) {
    return jsonError((err as Error).message ?? "خطا", 500);
  }
}

function buildLinks(payload: Record<string, unknown>): Record<string, string> {
  const links: Record<string, string> = {};
  if (payload.deliverableId) links.deliverable = `/workflow?deliverable=${payload.deliverableId}`;
  if (payload.publicationId) links.publication = `/workflow/publication/${payload.publicationId}`;
  // generic workflow link
  if (!Object.keys(links).length) links.workflow = "/workflow";
  return links;
}
