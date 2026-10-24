import { generateEntityId } from "@/lib/ids";
import type { JobFunction } from "@/lib/job-functions";
import { canSubmitAssignment, canViewTask, getTaskCapabilities } from "./access";
import { buildTaskDue24hRow, buildTaskNotificationKey } from "./notifications";
import type {
  CreateTaskInput,
  ListTaskHistoryInput,
  ListTasksInput,
  ReturnAssignmentsInput,
  SubmitAssignmentInput,
  TaskAccessRecord,
  TaskActor,
  TaskAssignmentStatus,
  TaskAssignmentView,
  TaskDetail,
  TaskHistoryItem,
  TaskHistoryPage,
  TaskPage,
  TaskStatus,
  UpdateTaskInput,
  VersionedTaskActionInput,
} from "./types";

export type TaskRepositoryErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "INVALID_LINK"
  | "NOTIFICATION_WRITE_FAILED";

export class TaskRepositoryError extends Error {
  constructor(
    public code: TaskRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TaskRepositoryError";
  }
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: Date | null;
  productId: string | null;
  partId: string | null;
  createdBy: string | null;
  version: number;
  awaitingApprovalAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskAssignmentRecord {
  taskId: string;
  jobFunction: JobFunction;
  status: TaskAssignmentStatus;
  submissionNote: string | null;
  submissionUrl: string | null;
  submittedBy: string | null;
  submittedAt: Date | null;
}

export interface TaskLinkSummary {
  productTitle: string | null;
  partNumber: number | null;
  channel: string | null;
}

export interface TaskAggregate {
  task: TaskRecord;
  assignments: TaskAssignmentRecord[];
  link: TaskLinkSummary;
}

export interface TaskEventRecord {
  id: string;
  entityType: "task" | "task_assignment";
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorUserId: string | null;
  source: "api" | "scheduler";
  reason: string | null;
  createdAt: Date;
}

export interface TaskNotificationRecord {
  id: string;
  recipientUserId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  scheduledAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskMutationBundle {
  task: TaskRecord;
  assignments: TaskAssignmentRecord[];
  events: TaskEventRecord[];
  notifications: TaskNotificationRecord[];
  cancelPendingReminderTaskIds: string[];
}

export interface TaskPort {
  now(): Date;
  getTaskAggregate(taskId: string): Promise<TaskAggregate | null>;
  listTaskAggregates(input: ListTasksInput): Promise<{ items: TaskAggregate[]; nextCursor: string | null; total: number }>;
  listTaskHistory(input: ListTaskHistoryInput): Promise<TaskHistoryPage>;
  validateLink(productId: string | null, partId: string | null): Promise<TaskLinkSummary>;
  resolveJobRecipients(jobFunctions: JobFunction[], channel: string | null): Promise<TaskActor[]>;
  resolveOwners(): Promise<TaskActor[]>;
  commitCreate(bundle: TaskMutationBundle): Promise<void>;
  commitMutation(taskId: string, expectedVersion: number, bundle: TaskMutationBundle): Promise<void>;
  getUserName(userId: string | null): Promise<string | null>;
  listReminderCandidates(): Promise<import("./notifications").TaskReminderCandidate[]>;
  insertTaskNotifications(rows: TaskNotificationRecord[]): Promise<number>;
}

export interface TaskRepository {
  listTasks(input: ListTasksInput): Promise<TaskPage>;
  getTask(input: { actor: TaskActor; taskId: string }): Promise<TaskDetail | null>;
  listHistory(input: ListTaskHistoryInput): Promise<TaskHistoryPage>;
  createTask(input: CreateTaskInput): Promise<TaskDetail>;
  updateTask(input: UpdateTaskInput): Promise<TaskDetail>;
  submitAssignment(input: SubmitAssignmentInput): Promise<TaskDetail>;
  returnAssignments(input: ReturnAssignmentsInput): Promise<TaskDetail>;
  approveTask(input: VersionedTaskActionInput): Promise<TaskDetail>;
  archiveTask(input: VersionedTaskActionInput): Promise<TaskDetail>;
}

function taskAccessRecord(aggregate: TaskAggregate): TaskAccessRecord {
  return {
    status: aggregate.task.status,
    channel: aggregate.link.channel,
    assignedJobFunctions: aggregate.assignments.map((assignment) => assignment.jobFunction),
    assignmentStatuses: Object.fromEntries(
      aggregate.assignments.map((assignment) => [assignment.jobFunction, assignment.status]),
    ),
  };
}

function taskSnapshot(task: TaskRecord): Record<string, unknown> {
  return { ...task };
}

function assignmentSnapshot(assignment: TaskAssignmentRecord): Record<string, unknown> {
  return { ...assignment };
}

function event(
  now: Date,
  actorUserId: string,
  entityType: TaskEventRecord["entityType"],
  entityId: string,
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  reason: string | null = null,
): TaskEventRecord {
  return {
    id: generateEntityId("WEV"),
    entityType,
    entityId,
    action,
    before,
    after,
    actorUserId,
    source: "api",
    reason,
    createdAt: now,
  };
}

function uniqueActors(actors: TaskActor[]): TaskActor[] {
  return [...new Map(actors.map((actor) => [actor.id, actor])).values()];
}

function notification(
  now: Date,
  task: TaskRecord,
  recipientUserId: string,
  eventType: string,
  jobFunction?: JobFunction,
  reason?: string,
): TaskNotificationRecord {
  return {
    id: generateEntityId("WNT"),
    recipientUserId,
    eventType,
    payload: {
      taskId: task.id,
      title: task.title,
      version: task.version,
      ...(jobFunction ? { jobFunction } : {}),
      ...(task.dueAt ? { dueAt: task.dueAt.toISOString() } : {}),
      ...(reason ? { reason } : {}),
    },
    idempotencyKey: buildTaskNotificationKey({
      taskId: task.id,
      event: eventType,
      version: task.version,
      recipientUserId,
      jobFunction,
    }),
    scheduledAt: now,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

async function dueReminderRows(
  port: TaskPort,
  now: Date,
  task: TaskRecord,
  assignments: TaskAssignmentRecord[],
  channel: string | null,
): Promise<TaskNotificationRecord[]> {
  if (!task.dueAt || task.status !== "open") return [];
  const openJobs = assignments.filter((assignment) => assignment.status === "open").map((assignment) => assignment.jobFunction);
  if (openJobs.length === 0) return [];
  const recipients = uniqueActors(await port.resolveJobRecipients(openJobs, channel));
  const rows: TaskNotificationRecord[] = [];
  for (const jobFunction of openJobs) {
    for (const recipient of recipients.filter((actor) => actor.jobFunctions.includes(jobFunction))) {
      rows.push(
        buildTaskDue24hRow({
          now,
          taskId: task.id,
          title: task.title,
          version: task.version,
          dueAt: task.dueAt,
          recipientUserId: recipient.id,
          jobFunction,
        }),
      );
    }
  }
  return rows;
}

function assertOwner(actor: TaskActor): void {
  if (!actor.active || actor.role !== "owner") {
    throw new TaskRepositoryError("FORBIDDEN", "فقط مالک می‌تواند این عملیات را انجام دهد.");
  }
}

function assertMutable(task: TaskRecord): void {
  if (task.status === "completed" || task.status === "archived") {
    throw new TaskRepositoryError("INVALID_TRANSITION", "این کار دیگر قابل ویرایش نیست.");
  }
}

async function detailFromAggregate(port: TaskPort, actor: TaskActor, aggregate: TaskAggregate): Promise<TaskDetail> {
  const access = taskAccessRecord(aggregate);
  const assignments: TaskAssignmentView[] = await Promise.all(
    aggregate.assignments.map(async (assignment) => ({
      jobFunction: assignment.jobFunction,
      status: assignment.status,
      submissionNote: assignment.submissionNote,
      submissionUrl: assignment.submissionUrl,
      submittedBy: assignment.submittedBy,
      submittedByName: await port.getUserName(assignment.submittedBy),
      submittedAt: assignment.submittedAt,
      canSubmit: canSubmitAssignment(actor, access, assignment.jobFunction),
    })),
  );
  const history = await port.listTaskHistory({ actor, taskId: aggregate.task.id, limit: 20 });

  return {
    ...aggregate.task,
    ...aggregate.link,
    assignments,
    capabilities: getTaskCapabilities(actor, access),
    createdByName: await port.getUserName(aggregate.task.createdBy),
    recentHistory: history.items,
  };
}

async function requireVisibleAggregate(port: TaskPort, actor: TaskActor, taskId: string): Promise<TaskAggregate> {
  const aggregate = await port.getTaskAggregate(taskId);
  if (!aggregate || !canViewTask(actor, taskAccessRecord(aggregate))) {
    throw new TaskRepositoryError("NOT_FOUND", "کار پیدا نشد.");
  }
  return aggregate;
}

export function createTaskRepository(port: TaskPort): TaskRepository {
  return {
    async listTasks(input) {
      const page = await port.listTaskAggregates(input);
      return {
        items: await Promise.all(
          page.items.map(async (aggregate) => {
            const detail = await detailFromAggregate(port, input.actor, aggregate);
            const { description: _description, createdBy: _createdBy, createdByName: _createdByName, updatedAt: _updatedAt, recentHistory: _recentHistory, ...card } = detail;
            return card;
          }),
        ),
        nextCursor: page.nextCursor,
        total: page.total,
      };
    },

    async getTask({ actor, taskId }) {
      const aggregate = await port.getTaskAggregate(taskId);
      if (!aggregate || !canViewTask(actor, taskAccessRecord(aggregate))) return null;
      return detailFromAggregate(port, actor, aggregate);
    },

    async listHistory(input) {
      await requireVisibleAggregate(port, input.actor, input.taskId);
      return port.listTaskHistory(input);
    },

    async createTask(input) {
      assertOwner(input.actor);
      const now = port.now();
      const link = await port.validateLink(input.productId, input.partId);
      const task: TaskRecord = {
        id: generateEntityId("TSK"),
        title: input.title,
        description: input.description,
        status: "open",
        dueAt: input.dueAt,
        productId: input.productId,
        partId: input.partId,
        createdBy: input.actor.id,
        version: 1,
        awaitingApprovalAt: null,
        completedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const assignments = input.jobFunctions.map<TaskAssignmentRecord>((jobFunction) => ({
        taskId: task.id,
        jobFunction,
        status: "open",
        submissionNote: null,
        submissionUrl: null,
        submittedBy: null,
        submittedAt: null,
      }));
      if (assignments.length === 0) {
        throw new TaskRepositoryError("INVALID_TRANSITION", "حداقل یک سمت لازم است.");
      }
      const recipients = uniqueActors(await port.resolveJobRecipients(input.jobFunctions, link.channel));
      await port.commitCreate({
        task,
        assignments,
        events: [event(now, input.actor.id, "task", task.id, "task_created", null, taskSnapshot(task))],
        notifications: [
          ...recipients.map((recipient) => notification(now, task, recipient.id, "task_created")),
          ...(await dueReminderRows(port, now, task, assignments, link.channel)),
        ],
        cancelPendingReminderTaskIds: [],
      });
      return detailFromAggregate(port, input.actor, { task, assignments, link });
    },

    async updateTask(input) {
      assertOwner(input.actor);
      const current = await requireVisibleAggregate(port, input.actor, input.taskId);
      assertMutable(current.task);
      const now = port.now();
      const nextJobFunctions = input.jobFunctions ?? current.assignments.map((assignment) => assignment.jobFunction);
      if (nextJobFunctions.length === 0) {
        throw new TaskRepositoryError("INVALID_TRANSITION", "حداقل یک سمت لازم است.");
      }
      const currentJobs = new Set(current.assignments.map((assignment) => assignment.jobFunction));
      const nextJobs = new Set(nextJobFunctions);
      const addedJobs = nextJobFunctions.filter((jobFunction) => !currentJobs.has(jobFunction));
      const removed = current.assignments.filter((assignment) => !nextJobs.has(assignment.jobFunction));
      if ((addedJobs.length > 0 || removed.length > 0) && current.task.status !== "open") {
        throw new TaskRepositoryError("INVALID_TRANSITION", "سمت‌های کار فقط در وضعیت باز قابل تغییرند.");
      }
      const assignments = [
        ...current.assignments.filter((assignment) => nextJobs.has(assignment.jobFunction)),
        ...addedJobs.map<TaskAssignmentRecord>((jobFunction) => ({
          taskId: current.task.id,
          jobFunction,
          status: "open",
          submissionNote: null,
          submissionUrl: null,
          submittedBy: null,
          submittedAt: null,
        })),
      ];
      const allSubmitted = assignments.every((assignment) => assignment.status === "submitted");
      const productId = input.productId === undefined ? current.task.productId : input.productId;
      const partId = input.partId === undefined ? current.task.partId : input.partId;
      const linkChanged = input.productId !== undefined || input.partId !== undefined;
      const link = linkChanged ? await port.validateLink(productId, partId) : current.link;
      const task: TaskRecord = {
        ...current.task,
        title: input.title ?? current.task.title,
        description: input.description === undefined ? current.task.description : input.description,
        dueAt: input.dueAt === undefined ? current.task.dueAt : input.dueAt,
        productId,
        partId,
        status: allSubmitted ? "awaiting_approval" : "open",
        awaitingApprovalAt: allSubmitted ? current.task.awaitingApprovalAt ?? now : null,
        version: current.task.version + 1,
        updatedAt: now,
      };
      const events = [event(now, input.actor.id, "task", task.id, "task_updated", taskSnapshot(current.task), taskSnapshot(task))];
      for (const assignment of removed) {
        events.push(
          event(now, input.actor.id, "task_assignment", `${task.id}:${assignment.jobFunction}`, "task_assignment_removed", assignmentSnapshot(assignment), null),
        );
      }
      for (const jobFunction of addedJobs) {
        const assignment = assignments.find((item) => item.jobFunction === jobFunction)!;
        events.push(
          event(now, input.actor.id, "task_assignment", `${task.id}:${jobFunction}`, "task_assignment_added", null, assignmentSnapshot(assignment)),
        );
      }
      const addedRecipients = uniqueActors(await port.resolveJobRecipients(addedJobs, link.channel));
      const dueChanged = (current.task.dueAt?.getTime() ?? null) !== (task.dueAt?.getTime() ?? null);
      const jobsChanged = addedJobs.length > 0 || removed.length > 0;
      await port.commitMutation(task.id, input.expectedVersion, {
        task,
        assignments,
        events,
        notifications: [
          ...addedRecipients.map((recipient) => notification(now, task, recipient.id, "task_assignment_added")),
          ...((dueChanged || jobsChanged) ? await dueReminderRows(port, now, task, assignments, link.channel) : []),
        ],
        cancelPendingReminderTaskIds: dueChanged || jobsChanged ? [task.id] : [],
      });
      return detailFromAggregate(port, input.actor, { task, assignments, link });
    },

    async submitAssignment(input) {
      const current = await requireVisibleAggregate(port, input.actor, input.taskId);
      const access = taskAccessRecord(current);
      if (!canSubmitAssignment(input.actor, access, input.jobFunction)) {
        throw new TaskRepositoryError("FORBIDDEN", "اجازه ارسال این سمت را ندارید.");
      }
      const now = port.now();
      const beforeAssignment = current.assignments.find((assignment) => assignment.jobFunction === input.jobFunction)!;
      const assignments = current.assignments.map((assignment) =>
        assignment.jobFunction === input.jobFunction
          ? {
              ...assignment,
              status: "submitted" as const,
              submissionNote: input.submissionNote,
              submissionUrl: input.submissionUrl,
              submittedBy: input.actor.id,
              submittedAt: now,
            }
          : assignment,
      );
      const allSubmitted = assignments.every((assignment) => assignment.status === "submitted");
      const task: TaskRecord = {
        ...current.task,
        status: allSubmitted ? "awaiting_approval" : "open",
        awaitingApprovalAt: allSubmitted ? now : null,
        version: current.task.version + 1,
        updatedAt: now,
      };
      const afterAssignment = assignments.find((assignment) => assignment.jobFunction === input.jobFunction)!;
      const owners = uniqueActors(await port.resolveOwners());
      await port.commitMutation(task.id, input.expectedVersion, {
        task,
        assignments,
        events: [
          event(
            now,
            input.actor.id,
            "task_assignment",
            `${task.id}:${input.jobFunction}`,
            "task_assignment_submitted",
            assignmentSnapshot(beforeAssignment),
            assignmentSnapshot(afterAssignment),
          ),
        ],
        notifications: [
          ...owners.map((recipient) =>
            notification(now, task, recipient.id, "task_assignment_submitted", input.jobFunction),
          ),
          ...(await dueReminderRows(port, now, task, assignments, current.link.channel)),
        ],
        cancelPendingReminderTaskIds: [task.id],
      });
      return detailFromAggregate(port, input.actor, { ...current, task, assignments });
    },

    async returnAssignments(input) {
      assertOwner(input.actor);
      const current = await requireVisibleAggregate(port, input.actor, input.taskId);
      assertMutable(current.task);
      const selected = new Set(input.jobFunctions);
      const selectedAssignments = current.assignments.filter((assignment) => selected.has(assignment.jobFunction));
      if (
        selectedAssignments.length !== selected.size ||
        selectedAssignments.some((assignment) => assignment.status !== "submitted")
      ) {
        throw new TaskRepositoryError("INVALID_TRANSITION", "فقط سمت‌های ارسال‌شده قابل برگشت هستند.");
      }
      const now = port.now();
      const assignments = current.assignments.map((assignment) =>
        selected.has(assignment.jobFunction)
          ? {
              ...assignment,
              status: "open" as const,
              submissionNote: null,
              submissionUrl: null,
              submittedBy: null,
              submittedAt: null,
            }
          : assignment,
      );
      const task: TaskRecord = {
        ...current.task,
        status: "open",
        awaitingApprovalAt: null,
        version: current.task.version + 1,
        updatedAt: now,
      };
      const events = [
        event(now, input.actor.id, "task", task.id, "task_returned", taskSnapshot(current.task), taskSnapshot(task), input.reason),
        ...selectedAssignments.map((beforeAssignment) => {
          const afterAssignment = assignments.find((assignment) => assignment.jobFunction === beforeAssignment.jobFunction)!;
          return event(
            now,
            input.actor.id,
            "task_assignment",
            `${task.id}:${beforeAssignment.jobFunction}`,
            "task_assignment_returned",
            assignmentSnapshot(beforeAssignment),
            assignmentSnapshot(afterAssignment),
            input.reason,
          );
        }),
      ];
      const recipients = uniqueActors(await port.resolveJobRecipients(input.jobFunctions, current.link.channel));
      await port.commitMutation(task.id, input.expectedVersion, {
        task,
        assignments,
        events,
        notifications: [
          ...recipients.map((recipient) => notification(now, task, recipient.id, "task_returned", undefined, input.reason)),
          ...(await dueReminderRows(port, now, task, assignments, current.link.channel)),
        ],
        cancelPendingReminderTaskIds: [task.id],
      });
      return detailFromAggregate(port, input.actor, { ...current, task, assignments });
    },

    async approveTask(input) {
      assertOwner(input.actor);
      const current = await requireVisibleAggregate(port, input.actor, input.taskId);
      if (
        current.task.status !== "awaiting_approval" ||
        current.assignments.some((assignment) => assignment.status !== "submitted")
      ) {
        throw new TaskRepositoryError("INVALID_TRANSITION", "این کار هنوز آماده تأیید نیست.");
      }
      const now = port.now();
      const task: TaskRecord = {
        ...current.task,
        status: "completed",
        completedAt: now,
        version: current.task.version + 1,
        updatedAt: now,
      };
      const recipients = uniqueActors(
        await port.resolveJobRecipients(
          current.assignments.map((assignment) => assignment.jobFunction),
          current.link.channel,
        ),
      );
      await port.commitMutation(task.id, input.expectedVersion, {
        task,
        assignments: current.assignments,
        events: [event(now, input.actor.id, "task", task.id, "task_approved", taskSnapshot(current.task), taskSnapshot(task))],
        notifications: recipients.map((recipient) => notification(now, task, recipient.id, "task_approved")),
        cancelPendingReminderTaskIds: [task.id],
      });
      return detailFromAggregate(port, input.actor, { ...current, task });
    },

    async archiveTask(input) {
      assertOwner(input.actor);
      const current = await requireVisibleAggregate(port, input.actor, input.taskId);
      if (current.task.status === "archived") {
        throw new TaskRepositoryError("INVALID_TRANSITION", "این کار قبلاً بایگانی شده است.");
      }
      const now = port.now();
      const task: TaskRecord = {
        ...current.task,
        status: "archived",
        archivedAt: now,
        version: current.task.version + 1,
        updatedAt: now,
      };
      await port.commitMutation(task.id, input.expectedVersion, {
        task,
        assignments: current.assignments,
        events: [event(now, input.actor.id, "task", task.id, "task_archived", taskSnapshot(current.task), taskSnapshot(task))],
        notifications: [],
        cancelPendingReminderTaskIds: [task.id],
      });
      return detailFromAggregate(port, input.actor, { ...current, task });
    },
  };
}

export class InMemoryTaskPort implements TaskPort {
  readonly tasks = new Map<string, TaskRecord>();
  readonly assignments = new Map<string, TaskAssignmentRecord[]>();
  events: TaskEventRecord[] = [];
  notifications: TaskNotificationRecord[] = [];
  private readonly actors = new Map<string, TaskActor>();
  private readonly names = new Map<string, string>();
  private currentTime: Date;

  constructor(options?: { now?: Date; actors?: TaskActor[] }) {
    this.currentTime = options?.now ?? new Date();
    for (const actor of options?.actors ?? []) {
      this.actors.set(actor.id, structuredClone(actor));
      this.names.set(actor.id, actor.id);
    }
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  async getTaskAggregate(taskId: string): Promise<TaskAggregate | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return {
      task: structuredClone(task),
      assignments: structuredClone(this.assignments.get(taskId) ?? []),
      link: { productTitle: null, partNumber: null, channel: null },
    };
  }

  async listTaskAggregates(input: ListTasksInput) {
    const all = await Promise.all([...this.tasks.keys()].map((taskId) => this.getTaskAggregate(taskId)));
    const visible = all.filter(
      (aggregate): aggregate is TaskAggregate =>
        !!aggregate &&
        aggregate.task.status === input.column &&
        canViewTask(input.actor, taskAccessRecord(aggregate)),
    );
    return { items: visible.slice(0, input.limit), nextCursor: null, total: visible.length };
  }

  async listTaskHistory(input: ListTaskHistoryInput): Promise<TaskHistoryPage> {
    const matching = this.events
      .filter(
        (item) =>
          (item.entityType === "task" && item.entityId === input.taskId) ||
          (item.entityType === "task_assignment" && item.entityId.startsWith(`${input.taskId}:`)),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, input.limit);
    return {
      items: await Promise.all(
        matching.map(async (item) => ({
          ...structuredClone(item),
          actorName: await this.getUserName(item.actorUserId),
        })),
      ),
      nextCursor: null,
    };
  }

  async validateLink(productId: string | null, partId: string | null): Promise<TaskLinkSummary> {
    if (!productId && partId) {
      throw new TaskRepositoryError("INVALID_LINK", "قسمت بدون محصول معتبر نیست.");
    }
    if (productId || partId) {
      throw new TaskRepositoryError("INVALID_LINK", "پیوند محتوا در این درگاه ثبت نشده است.");
    }
    return { productTitle: null, partNumber: null, channel: null };
  }

  async resolveJobRecipients(jobFunctions: JobFunction[], _channel: string | null): Promise<TaskActor[]> {
    return [...this.actors.values()].filter(
      (actor) => actor.active && jobFunctions.some((jobFunction) => actor.jobFunctions.includes(jobFunction)),
    );
  }

  async resolveOwners(): Promise<TaskActor[]> {
    return [...this.actors.values()].filter((actor) => actor.active && actor.role === "owner");
  }

  async commitCreate(bundle: TaskMutationBundle): Promise<void> {
    if (this.tasks.has(bundle.task.id)) throw new Error("duplicate task");
    const nextTasks = new Map(this.tasks);
    const nextAssignments = new Map(this.assignments);
    nextTasks.set(bundle.task.id, structuredClone(bundle.task));
    nextAssignments.set(bundle.task.id, structuredClone(bundle.assignments));
    this.replaceState(nextTasks, nextAssignments, [...this.events, ...structuredClone(bundle.events)], [
      ...this.applyReminderCancellations(this.notifications, bundle),
      ...structuredClone(bundle.notifications),
    ]);
  }

  async commitMutation(taskId: string, expectedVersion: number, bundle: TaskMutationBundle): Promise<void> {
    const current = this.tasks.get(taskId);
    if (!current) throw new TaskRepositoryError("NOT_FOUND", "کار پیدا نشد.");
    if (current.version !== expectedVersion) {
      throw new TaskRepositoryError("VERSION_CONFLICT", "این کار تغییر کرده است. دوباره تلاش کنید.");
    }
    const nextTasks = new Map(this.tasks);
    const nextAssignments = new Map(this.assignments);
    nextTasks.set(taskId, structuredClone(bundle.task));
    nextAssignments.set(taskId, structuredClone(bundle.assignments));
    this.replaceState(nextTasks, nextAssignments, [...this.events, ...structuredClone(bundle.events)], [
      ...this.applyReminderCancellations(this.notifications, bundle),
      ...structuredClone(bundle.notifications),
    ]);
  }

  private applyReminderCancellations(
    existing: TaskNotificationRecord[],
    bundle: TaskMutationBundle,
  ): TaskNotificationRecord[] {
    if (bundle.cancelPendingReminderTaskIds.length === 0) return structuredClone(existing);
    const keepKeys = new Set(bundle.notifications.map((row) => row.idempotencyKey));
    return structuredClone(existing).map((row) => {
      const taskId = typeof (row.payload as Record<string, unknown> | null)?.taskId === "string"
        ? ((row.payload as Record<string, unknown>).taskId as string)
        : null;
      if (
        row.status === "pending" &&
        (row.eventType === "task_due_24h" || row.eventType === "task_overdue") &&
        taskId !== null &&
        bundle.cancelPendingReminderTaskIds.includes(taskId) &&
        !keepKeys.has(row.idempotencyKey)
      ) {
        return { ...row, status: "cancelled" as const, updatedAt: bundle.task.updatedAt };
      }
      return row;
    });
  }

  async getUserName(userId: string | null): Promise<string | null> {
    return userId ? this.names.get(userId) ?? null : null;
  }

  async listReminderCandidates(): Promise<import("./notifications").TaskReminderCandidate[]> {
    const candidates: import("./notifications").TaskReminderCandidate[] = [];
    for (const [taskId, task] of this.tasks) {
      if (task.status === "completed" || task.status === "archived") continue;
      if (!task.dueAt) continue;
      const aggregate = await this.getTaskAggregate(taskId);
      if (!aggregate) continue;
      const openJobFunctions = aggregate.assignments
        .filter((assignment) => assignment.status === "open")
        .map((assignment) => assignment.jobFunction);
      if (openJobFunctions.length === 0) continue;
      candidates.push({
        taskId: task.id,
        title: task.title,
        dueAt: task.dueAt,
        status: task.status,
        channel: aggregate.link.channel,
        openJobFunctions,
      });
    }
    return candidates;
  }

  async insertTaskNotifications(rows: TaskNotificationRecord[]): Promise<number> {
    const existingKeys = new Set(this.notifications.map((row) => row.idempotencyKey));
    let inserted = 0;
    for (const row of rows) {
      if (existingKeys.has(row.idempotencyKey)) continue;
      existingKeys.add(row.idempotencyKey);
      this.notifications.push(structuredClone(row));
      inserted += 1;
    }
    return inserted;
  }

  snapshot() {
    return structuredClone({
      tasks: [...this.tasks.entries()],
      assignments: [...this.assignments.entries()],
      events: this.events,
      notifications: this.notifications,
    });
  }

  private replaceState(
    tasks: Map<string, TaskRecord>,
    assignments: Map<string, TaskAssignmentRecord[]>,
    events: TaskEventRecord[],
    notifications: TaskNotificationRecord[],
  ): void {
    this.tasks.clear();
    for (const [id, task] of tasks) this.tasks.set(id, task);
    this.assignments.clear();
    for (const [id, value] of assignments) this.assignments.set(id, value);
    this.events = events;
    this.notifications = notifications;
  }
}
