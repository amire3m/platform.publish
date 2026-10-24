import { jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { db } from "@/db";
import { workflowNotifications } from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { taskActorFromUser } from "@/lib/task-board/access";
import { createTaskNotificationVisibilityChecker } from "@/lib/task-board/notifications";
import { PostgresTaskPort } from "@/lib/task-board/postgres-port";
import type { TaskActor } from "@/lib/task-board/types";

export interface WorkflowNotificationListRow {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface WorkflowNotificationsRouteRepository {
  listForUser(userId: string, opts: { limit: number; offset: number; unreadOnly: boolean }): Promise<WorkflowNotificationListRow[]>;
  countUnread(userId: string): Promise<number>;
  checkTaskVisibility(actor: TaskActor, row: { eventType: string; payload: Record<string, unknown> }): Promise<boolean>;
}

export interface WorkflowNotificationsRouteDependencies {
  requirePermission: typeof requirePermission;
  repository: WorkflowNotificationsRouteRepository;
}

const taskPort = new PostgresTaskPort();
const checkVisibility = createTaskNotificationVisibilityChecker({
  getTaskAggregate: (taskId) => taskPort.getTaskAggregate(taskId),
});

const defaultDeps: WorkflowNotificationsRouteDependencies = {
  requirePermission,
  repository: {
    async listForUser(userId, opts) {
      const conditions: unknown[] = [eq(workflowNotifications.recipientUserId, userId)];
      if (opts.unreadOnly) conditions.push(isNull(workflowNotifications.readAt));
      return (await db
        .select()
        .from(workflowNotifications)
        .where(and(...(conditions as never[])))
        .orderBy(desc(workflowNotifications.createdAt))
        .limit(opts.limit)
        .offset(opts.offset)) as unknown as WorkflowNotificationListRow[];
    },
    async countUnread(userId) {
      const rows = await db
        .select()
        .from(workflowNotifications)
        .where(and(eq(workflowNotifications.recipientUserId, userId), isNull(workflowNotifications.readAt)));
      return rows.filter((row) => !row.readAt).length;
    },
    checkTaskVisibility: (actor, row) => checkVisibility(actor, row),
  },
};

export async function handleNotificationsRequest(
  req: Request,
  deps: WorkflowNotificationsRouteDependencies = defaultDeps,
): Promise<Response> {
  const { user, response } = await deps.requirePermission("view_workflow");
  if (!user) return response!;
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const userId = (user as unknown as { id: string }).id;
  const actor = taskActorFromUser(user as never);

  try {
    const rows = await deps.repository.listForUser(userId, { limit, offset, unreadOnly });
    const unreadCount = await deps.repository.countUnread(userId);

    const visible: WorkflowNotificationListRow[] = [];
    for (const row of rows) {
      try {
        if (await deps.repository.checkTaskVisibility(actor, { eventType: row.eventType, payload: row.payload })) {
          visible.push(row);
        }
      } catch {
        continue;
      }
    }

    const safeRows = visible.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      payload: row.payload,
      status: row.status,
      readAt: row.readAt,
      createdAt: row.createdAt,
      links: buildLinks(row.payload as Record<string, unknown>),
    }));

    return jsonOk({ items: safeRows, unreadCount, total: safeRows.length });
  } catch (err) {
    return jsonInternalError(err, "api/workflow/notifications");
  }
}

export async function GET(req: Request) {
  return handleNotificationsRequest(req, defaultDeps);
}

function buildLinks(payload: Record<string, unknown>): Record<string, string> {
  const links: Record<string, string> = {};
  if (payload.taskId) links.task = `/tasks?task=${payload.taskId}`;
  if (payload.deliverableId) links.deliverable = `/workflow?deliverable=${payload.deliverableId}`;
  if (payload.publicationId) links.publication = `/workflow/publication/${payload.publicationId}`;
  if (!Object.keys(links).length) links.workflow = "/workflow";
  return links;
}
