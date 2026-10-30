import { DateTime } from "luxon";
import { and, asc, desc, eq, inArray, isNotNull, like, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  contentParts,
  contentProducts,
  taskAssignments,
  tasks,
  users,
  workflowEvents,
  workflowNotifications,
} from "@/db/schema";
import { HIDDEN_CHANNEL_IDS, isChannelHidden } from "@/lib/channels";
import { normalizeJobFunctions, type JobFunction } from "@/lib/job-functions";
import { canViewTask } from "./access";
import {
  isTaskNotificationType,
  validateTaskNotificationRecipient,
  type TaskReminderCandidate,
} from "./notifications";
import {
  createTaskRepository,
  TaskRepositoryError,
  type TaskAggregate,
  type TaskAssignmentRecord,
  type TaskEventRecord,
  type TaskLinkSummary,
  type TaskMutationBundle,
  type TaskNotificationRecord,
  type TaskPort,
  type TaskRecord,
} from "./repository";
import type {
  ListTaskHistoryInput,
  ListTasksInput,
  TaskActor,
  TaskColumn,
  TaskHistoryPage,
} from "./types";

const TEHRAN_ZONE = "Asia/Tehran";
const BROAD_READ_ROLES = new Set(["owner", "manager", "analyst", "publisher"]);

type CursorValue = Record<string, string | null>;
interface CursorEnvelope {
  column: TaskColumn;
  value: CursorValue;
}

const CURSOR_FIELDS: Record<TaskColumn, string[]> = {
  open: ["dueAt", "createdAt", "id"],
  awaiting_approval: ["awaitingApprovalAt", "id"],
  completed: ["completedAt", "id"],
  archived: ["archivedAt", "id"],
};

function invalidCursor(): never {
  throw new TaskRepositoryError("INVALID_LINK", "Invalid task cursor");
}

export function encodeTaskCursor(column: TaskColumn, value: CursorValue): string {
  return Buffer.from(JSON.stringify({ column, value } satisfies CursorEnvelope), "utf8").toString("base64url");
}

export function decodeTaskCursor(column: TaskColumn, cursor: string): CursorValue {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorEnvelope;
    if (parsed.column !== column || !parsed.value || typeof parsed.value !== "object") invalidCursor();
    const expected = CURSOR_FIELDS[column];
    if (Object.keys(parsed.value).sort().join("|") !== [...expected].sort().join("|")) invalidCursor();
    for (const field of expected) {
      const value = parsed.value[field];
      if (field === "dueAt" && value === null) continue;
      if (typeof value !== "string" || value.length === 0) invalidCursor();
    }
    return parsed.value;
  } catch (error) {
    if (error instanceof TaskRepositoryError) throw error;
    return invalidCursor();
  }
}

export function resolveCompletedRange({ now }: { now: Date }): { from: Date; to: Date } {
  const end = DateTime.fromJSDate(now).setZone(TEHRAN_ZONE).endOf("day");
  return {
    from: end.startOf("day").minus({ days: 30 }).toUTC().toJSDate(),
    to: end.toUTC().toJSDate(),
  };
}

export function resolveDueRange(kind: "today" | "week", now: Date): { from: Date; to: Date } {
  const start = DateTime.fromJSDate(now).setZone(TEHRAN_ZONE).startOf("day");
  const end = kind === "today" ? start.endOf("day") : start.plus({ days: 6 }).endOf("day");
  return { from: start.toUTC().toJSDate(), to: end.toUTC().toJSDate() };
}

export function visibleChannelsForActor(actor: Pick<TaskActor, "role" | "allowedChannels">): string[] | null {
  if (actor.role === "owner" || actor.allowedChannels.length === 0) return null;
  return actor.allowedChannels.filter((channel) => !isChannelHidden(channel));
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function rowToTask(row: Record<string, unknown>): TaskRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    status: row.status as TaskRecord["status"],
    dueAt: asDate(row.due_at),
    productId: row.product_id == null ? null : String(row.product_id),
    partId: row.part_id == null ? null : String(row.part_id),
    createdBy: row.created_by == null ? null : String(row.created_by),
    version: Number(row.version),
    awaitingApprovalAt: asDate(row.awaiting_approval_at),
    completedAt: asDate(row.completed_at),
    archivedAt: asDate(row.archived_at),
    createdAt: asDate(row.created_at)!,
    updatedAt: asDate(row.updated_at)!,
  };
}

function rowToLink(row: Record<string, unknown>): TaskLinkSummary {
  return {
    productTitle: row.product_title == null ? null : String(row.product_title),
    partNumber: row.part_number == null ? null : Number(row.part_number),
    channel: row.channel == null ? null : String(row.channel),
  };
}

function assignmentRow(row: typeof taskAssignments.$inferSelect): TaskAssignmentRecord {
  return {
    taskId: row.taskId,
    jobFunction: row.jobFunction as JobFunction,
    status: row.status as TaskAssignmentRecord["status"],
    submissionNote: row.submissionNote,
    submissionUrl: row.submissionUrl,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt,
  };
}

function baseSelect(): SQL {
  return sql`
    select
      t.id, t.title, t.description, t.status, t.due_at, t.product_id, t.part_id,
      t.created_by, t.version, t.awaiting_approval_at, t.completed_at, t.archived_at,
      t.created_at, t.updated_at, p.title as product_title, p.channel,
      cp.part_number
    from tasks t
    left join content_products p on p.id = t.product_id
    left join content_parts cp on cp.id = t.part_id
  `;
}

function cursorCondition(column: TaskColumn, value: CursorValue): SQL {
  if (column === "open") {
    if (value.dueAt === null) {
      return sql`(t.due_at is null and (t.created_at, t.id) > (${new Date(value.createdAt!)}, ${value.id!}))`;
    }
    const dueAt = new Date(value.dueAt);
    const createdAt = new Date(value.createdAt!);
    return sql`(
      t.due_at > ${dueAt}
      or (t.due_at = ${dueAt} and (t.created_at, t.id) > (${createdAt}, ${value.id!}))
      or t.due_at is null
    )`;
  }
  if (column === "awaiting_approval") {
    const at = new Date(value.awaitingApprovalAt!);
    return sql`(t.awaiting_approval_at, t.id) > (${at}, ${value.id!})`;
  }
  if (column === "completed") {
    const at = new Date(value.completedAt!);
    return sql`(t.completed_at < ${at} or (t.completed_at = ${at} and t.id < ${value.id!}))`;
  }
  const at = new Date(value.archivedAt!);
  return sql`(t.archived_at < ${at} or (t.archived_at = ${at} and t.id < ${value.id!}))`;
}

function orderFor(column: TaskColumn): SQL {
  if (column === "open") return sql`t.due_at asc nulls last, t.created_at asc, t.id asc`;
  if (column === "awaiting_approval") return sql`t.awaiting_approval_at asc, t.id asc`;
  if (column === "completed") return sql`t.completed_at desc, t.id desc`;
  return sql`t.archived_at desc, t.id desc`;
}

function cursorFromRow(column: TaskColumn, row: Record<string, unknown>): string {
  if (column === "open") {
    return encodeTaskCursor(column, {
      dueAt: asDate(row.due_at)?.toISOString() ?? null,
      createdAt: asDate(row.created_at)!.toISOString(),
      id: String(row.id),
    });
  }
  if (column === "awaiting_approval") {
    return encodeTaskCursor(column, {
      awaitingApprovalAt: asDate(row.awaiting_approval_at)!.toISOString(),
      id: String(row.id),
    });
  }
  if (column === "completed") {
    return encodeTaskCursor(column, { completedAt: asDate(row.completed_at)!.toISOString(), id: String(row.id) });
  }
  return encodeTaskCursor(column, { archivedAt: asDate(row.archived_at)!.toISOString(), id: String(row.id) });
}

function actorFromRow(row: typeof users.$inferSelect): TaskActor {
  return {
    id: row.id,
    role: row.role,
    active: row.active,
    jobFunctions: normalizeJobFunctions(row.jobFunctions),
    allowedChannels: Array.isArray(row.allowedChannels) ? row.allowedChannels : [],
  };
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertEventsAndNotifications(
  tx: DbTransaction,
  events: TaskEventRecord[],
  notifications: TaskNotificationRecord[],
): Promise<void> {
  if (events.length > 0) {
    await tx.insert(workflowEvents).values(
      events.map((item) => ({
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        action: item.action,
        before: item.before,
        after: item.after,
        actorUserId: item.actorUserId,
        source: item.source,
        reason: item.reason,
        createdAt: item.createdAt,
      })),
    );
  }
  if (notifications.length > 0) {
    await tx
      .insert(workflowNotifications)
      .values(
        notifications.map((item) => ({
          id: item.id,
          recipientUserId: item.recipientUserId,
          channel: "in_app",
          eventType: item.eventType,
          payload: item.payload,
          idempotencyKey: item.idempotencyKey,
          scheduledAt: item.scheduledAt,
          status: item.status,
          attempts: 0,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      )
      .onConflictDoNothing({ target: workflowNotifications.idempotencyKey });
  }
}

async function insertAssignments(tx: DbTransaction, assignments: TaskAssignmentRecord[]): Promise<void> {
  if (assignments.length === 0) return;
  await tx.insert(taskAssignments).values(assignments);
}

export function buildCancelPendingTaskRemindersQuery(bundle: {
  cancelPendingReminderTaskIds: string[];
  notifications: Array<Pick<TaskNotificationRecord, "idempotencyKey">>;
}): SQL {
  const taskIds = sql.join(bundle.cancelPendingReminderTaskIds.map((taskId) => sql`${taskId}`), sql`, `);
  const keepKeys = bundle.notifications.map((row) => row.idempotencyKey);
  const keepCondition = keepKeys.length > 0
    ? sql`and not (${workflowNotifications.idempotencyKey} in (${sql.join(keepKeys.map((key) => sql`${key}`), sql`, `)}))`
    : sql``;
  return sql`
    update workflow_notifications
    set status = 'cancelled', updated_at = now()
    where status = 'pending'
      and event_type in ('task_due_24h', 'task_overdue')
      and payload->>'taskId' in (${taskIds})
      ${keepCondition}
  `;
}

async function cancelPendingTaskReminders(tx: DbTransaction, bundle: TaskMutationBundle): Promise<void> {
  if (bundle.cancelPendingReminderTaskIds.length === 0) return;
  await tx.execute(buildCancelPendingTaskRemindersQuery(bundle));
}

export class PostgresTaskPort implements TaskPort {
  now(): Date {
    return new Date();
  }

  async getTaskAggregate(taskId: string): Promise<TaskAggregate | null> {
    const result = await db.execute(sql`${baseSelect()} where t.id = ${taskId} limit 1`);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const assignmentRows = await db.select().from(taskAssignments).where(eq(taskAssignments.taskId, taskId));
    return { task: rowToTask(row), assignments: assignmentRows.map(assignmentRow), link: rowToLink(row) };
  }

  async listTaskAggregates(input: ListTasksInput) {
    if (input.column === "archived" && input.actor.role !== "owner") {
      throw new TaskRepositoryError("FORBIDDEN", "فقط مالک می‌تواند بایگانی را ببیند.");
    }
    const conditions: SQL[] = [sql`t.status = ${input.column}`];
    conditions.push(sql`(p.channel is null or p.channel not in (${sql.join([...HIDDEN_CHANNEL_IDS].map((channel) => sql`${channel}`), sql`, `)}))`);

    const channels = visibleChannelsForActor(input.actor);
    if (channels) {
      if (channels.length === 0) conditions.push(sql`p.channel is null`);
      else conditions.push(sql`(p.channel is null or p.channel in (${sql.join(channels.map((channel) => sql`${channel}`), sql`, `)}))`);
    }

    if (!BROAD_READ_ROLES.has(input.actor.role)) {
      if (input.actor.jobFunctions.length === 0) return { items: [], nextCursor: null, total: 0 };
      conditions.push(sql`exists (
        select 1 from task_assignments visible_assignment
        where visible_assignment.task_id = t.id
          and visible_assignment.job_function in (${sql.join(input.actor.jobFunctions.map((job) => sql`${job}`), sql`, `)})
      )`);
    }
    if (input.jobFunction) {
      conditions.push(sql`exists (
        select 1 from task_assignments filter_assignment
        where filter_assignment.task_id = t.id and filter_assignment.job_function = ${input.jobFunction}
      )`);
    }
    if (input.search) {
      const term = `%${input.search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      conditions.push(sql`(t.title ilike ${term} escape '\\' or p.title ilike ${term} escape '\\')`);
    }
    if (input.productId) conditions.push(sql`t.product_id = ${input.productId}`);
    if (input.due === "none") conditions.push(sql`t.due_at is null`);
    if (input.due === "overdue") conditions.push(sql`t.due_at < ${this.now()}`);
    if (input.due === "today" || input.due === "week") {
      const range = resolveDueRange(input.due, this.now());
      conditions.push(sql`t.due_at between ${range.from} and ${range.to}`);
    }
    if (input.column === "completed") {
      const fallback = resolveCompletedRange({ now: this.now() });
      conditions.push(sql`t.completed_at >= ${input.completedFrom ?? fallback.from}`);
      conditions.push(sql`t.completed_at <= ${input.completedTo ?? fallback.to}`);
    }

    const baseConditions = [...conditions];
    if (input.cursor) conditions.push(cursorCondition(input.column, decodeTaskCursor(input.column, input.cursor)));
    const where = sql.join(conditions, sql` and `);
    const rowsResult = await db.execute(
      sql`${baseSelect()} where ${where} order by ${orderFor(input.column)} limit ${input.limit + 1}`,
    );
    const rows = rowsResult.rows as Record<string, unknown>[];
    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const ids = pageRows.map((row) => String(row.id));
    const allAssignments = ids.length
      ? await db.select().from(taskAssignments).where(inArray(taskAssignments.taskId, ids))
      : [];
    const byTask = new Map<string, TaskAssignmentRecord[]>();
    for (const row of allAssignments) {
      const list = byTask.get(row.taskId) ?? [];
      list.push(assignmentRow(row));
      byTask.set(row.taskId, list);
    }
    const totalResult = await db.execute(
      sql`select count(*)::int as total from tasks t left join content_products p on p.id = t.product_id where ${sql.join(baseConditions, sql` and `)}`,
    );

    return {
      items: pageRows.map((row) => ({ task: rowToTask(row), assignments: byTask.get(String(row.id)) ?? [], link: rowToLink(row) })),
      nextCursor: hasMore && pageRows.length ? cursorFromRow(input.column, pageRows.at(-1)!) : null,
      total: Number((totalResult.rows[0] as { total?: number } | undefined)?.total ?? 0),
    };
  }

  async listTaskHistory(input: ListTaskHistoryInput): Promise<TaskHistoryPage> {
    const conditions = [
      or(
        and(eq(workflowEvents.entityType, "task"), eq(workflowEvents.entityId, input.taskId)),
        and(eq(workflowEvents.entityType, "task_assignment"), like(workflowEvents.entityId, `${input.taskId}:%`)),
      )!,
    ];
    if (input.cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as { createdAt: string; id: string };
        conditions.push(
          or(
            sql`${workflowEvents.createdAt} < ${new Date(parsed.createdAt)}`,
            and(eq(workflowEvents.createdAt, new Date(parsed.createdAt)), sql`${workflowEvents.id} < ${parsed.id}`),
          )!,
        );
      } catch {
        throw new TaskRepositoryError("INVALID_LINK", "Invalid history cursor");
      }
    }
    const rows = await db
      .select({ event: workflowEvents, actorName: users.name })
      .from(workflowEvents)
      .leftJoin(users, eq(users.id, workflowEvents.actorUserId))
      .where(and(...conditions))
      .orderBy(desc(workflowEvents.createdAt), desc(workflowEvents.id))
      .limit(input.limit + 1);
    const pageRows = rows.slice(0, input.limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(({ event: item, actorName }) => ({
        id: item.id,
        entityType: item.entityType as "task" | "task_assignment",
        entityId: item.entityId,
        action: item.action,
        before: item.before,
        after: item.after,
        actorUserId: item.actorUserId,
        actorName,
        reason: item.reason,
        createdAt: item.createdAt,
      })),
      nextCursor:
        rows.length > input.limit && last
          ? Buffer.from(JSON.stringify({ createdAt: last.event.createdAt.toISOString(), id: last.event.id })).toString("base64url")
          : null,
    };
  }

  async validateLink(productId: string | null, partId: string | null): Promise<TaskLinkSummary> {
    if (!productId && partId) throw new TaskRepositoryError("INVALID_LINK", "قسمت بدون محصول معتبر نیست.");
    if (!productId) return { productTitle: null, partNumber: null, channel: null };
    const [row] = await db
      .select({
        productTitle: contentProducts.title,
        channel: contentProducts.channel,
        archivedAt: contentProducts.archivedAt,
        partId: contentParts.id,
        partNumber: contentParts.partNumber,
        partProductId: contentParts.productId,
        partActive: contentParts.isActive,
      })
      .from(contentProducts)
      .leftJoin(contentParts, partId ? eq(contentParts.id, partId) : sql`false`)
      .where(eq(contentProducts.id, productId))
      .limit(1);
    if (!row || row.archivedAt || isChannelHidden(row.channel)) {
      throw new TaskRepositoryError("INVALID_LINK", "محصول انتخاب‌شده قابل استفاده نیست.");
    }
    if (partId && (!row.partId || row.partProductId !== productId || !row.partActive)) {
      throw new TaskRepositoryError("INVALID_LINK", "قسمت انتخاب‌شده معتبر نیست.");
    }
    return { productTitle: row.productTitle, partNumber: partId ? row.partNumber : null, channel: row.channel };
  }

  async resolveJobRecipients(jobFunctions: JobFunction[], channel: string | null): Promise<TaskActor[]> {
    if (jobFunctions.length === 0) return [];
    const rows = await db.select().from(users).where(eq(users.active, true));
    return rows
      .map(actorFromRow)
      .filter((actor) => jobFunctions.some((jobFunction) => actor.jobFunctions.includes(jobFunction)))
      .filter((actor) =>
        canViewTask(actor, {
          status: "open",
          channel,
          assignedJobFunctions: jobFunctions,
          assignmentStatuses: {},
        }),
      );
  }

  async resolveOwners(): Promise<TaskActor[]> {
    const rows = await db.select().from(users).where(and(eq(users.active, true), eq(users.role, "owner")));
    return rows.map(actorFromRow);
  }

  async commitCreate(bundle: TaskMutationBundle): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.insert(tasks).values(bundle.task);
      await insertAssignments(tx, bundle.assignments);
      await cancelPendingTaskReminders(tx, bundle);
      await insertEventsAndNotifications(tx, bundle.events, bundle.notifications);
    });
  }

  async commitMutation(taskId: string, expectedVersion: number, bundle: TaskMutationBundle): Promise<void> {
    await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`select version from tasks where id = ${taskId} for update`);
      const current = locked.rows[0] as { version?: number } | undefined;
      if (!current) throw new TaskRepositoryError("NOT_FOUND", "کار پیدا نشد.");
      if (Number(current.version) !== expectedVersion) {
        throw new TaskRepositoryError("VERSION_CONFLICT", "این کار تغییر کرده است. دوباره تلاش کنید.");
      }
      await tx
        .update(tasks)
        .set({
          title: bundle.task.title,
          description: bundle.task.description,
          status: bundle.task.status,
          dueAt: bundle.task.dueAt,
          productId: bundle.task.productId,
          partId: bundle.task.partId,
          version: bundle.task.version,
          awaitingApprovalAt: bundle.task.awaitingApprovalAt,
          completedAt: bundle.task.completedAt,
          archivedAt: bundle.task.archivedAt,
          updatedAt: bundle.task.updatedAt,
        })
        .where(eq(tasks.id, taskId));
      await tx.delete(taskAssignments).where(eq(taskAssignments.taskId, taskId));
      await insertAssignments(tx, bundle.assignments);
      await cancelPendingTaskReminders(tx, bundle);
      await insertEventsAndNotifications(tx, bundle.events, bundle.notifications);
    });
  }

  async getUserName(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    return row?.name ?? null;
  }

  async listReminderCandidates(): Promise<TaskReminderCandidate[]> {
    const rows = await db
      .select({ task: tasks, channel: contentProducts.channel })
      .from(tasks)
      .leftJoin(contentProducts, eq(contentProducts.id, tasks.productId))
      .where(and(inArray(tasks.status, ["open", "awaiting_approval"]), isNotNull(tasks.dueAt)));
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.task.id);
    const assignmentRows = await db.select().from(taskAssignments).where(inArray(taskAssignments.taskId, ids));
    const byTask = new Map<string, typeof assignmentRows>();
    for (const row of assignmentRows) {
      const list = byTask.get(row.taskId) ?? [];
      list.push(row);
      byTask.set(row.taskId, list);
    }
    return rows.flatMap(({ task, channel }) => {
      const openJobFunctions = (byTask.get(task.id) ?? [])
        .filter((row) => row.status === "open")
        .map((row) => row.jobFunction as JobFunction);
      if (!task.dueAt || openJobFunctions.length === 0) return [];
      return [
        {
          taskId: task.id,
          title: task.title,
          dueAt: task.dueAt,
          status: task.status,
          channel,
          openJobFunctions,
        },
      ];
    });
  }

  async insertTaskNotifications(rows: TaskNotificationRecord[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await db
      .insert(workflowNotifications)
      .values(
        rows.map((item) => ({
          id: item.id,
          recipientUserId: item.recipientUserId,
          channel: "in_app",
          eventType: item.eventType,
          payload: item.payload,
          idempotencyKey: item.idempotencyKey,
          scheduledAt: item.scheduledAt,
          status: item.status,
          attempts: 0,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      )
      .onConflictDoNothing({ target: workflowNotifications.idempotencyKey })
      .returning({ id: workflowNotifications.id });
    return inserted.length;
  }
}

export function createDbTaskRecipientValidator(): (
  notification: { eventType: string; payload: Record<string, unknown>; recipientUserId: string | null },
) => Promise<boolean> {
  return async (notification) => {
    if (!isTaskNotificationType(notification.eventType)) return true;
    if (!notification.recipientUserId) return false;
    const port = new PostgresTaskPort();
    const [user] = await db.select().from(users).where(eq(users.id, notification.recipientUserId)).limit(1);
    const actor = user ? actorFromRow(user) : null;
    return validateTaskNotificationRecipient(
      notification as { eventType: string; payload: Record<string, unknown>; recipientUserId: string },
      {
        getActor: async () => actor,
        getTaskAggregate: (taskId) => port.getTaskAggregate(taskId),
      },
    );
  };
}

export const taskRepository = createTaskRepository(new PostgresTaskPort());
