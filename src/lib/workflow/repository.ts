import { generateEntityId } from "@/lib/ids";
import { deriveProgramProgress, selectNextAction } from "./progress";
import { transitionProduction, transitionPublication } from "./state-machine";
import type {
  ProductionAction,
  ProductionStatus,
  PublicationAction,
  PublicationStatus,
  TerminalOwner,
  WorkflowActor,
} from "./types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class WorkflowRepositoryError extends Error {
  constructor(
    public code: "VERSION_CONFLICT" | "NOT_FOUND" | "INVALID_TRANSITION" | "REASON_REQUIRED" | "PRODUCTION_NOT_READY",
    message: string,
  ) {
    super(message);
    this.name = "WorkflowRepositoryError";
  }
}

// ---------------------------------------------------------------------------
// Record types (camelCase mirrors schema)
// ---------------------------------------------------------------------------
export interface WorkflowProgramRecord {
  id: string;
  title: string;
  seriesName: string | null;
  ownerUserId: string | null;
  dueAt: Date | null;
  notes: string | null;
  source: string;
  sourceRef: string | null;
  version: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface WorkflowDeliverableRecord {
  id: string;
  programId: string;
  name: string;
  kind: string | null;
  sortOrder: number;
  productionStatus: ProductionStatus;
  assigneeUserId: string | null;
  dueAt: Date | null;
  notes: string | null;
  contentId: string | null;
  /** Telegram media token / playable URL of the actual file (set when created from content_room). */
  fileRef: string | null;
  archivedAt: Date | null;
  version: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowPublicationRecord {
  id: string;
  deliverableId: string;
  platform: string;
  socialAccountId: string | null;
  status: PublicationStatus;
  createdSource: string;
  terminalOwner: TerminalOwner | string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  externalId: string | null;
  permalink: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  manualReason: string | null;
  version: number;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowTemplateRecord {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface WorkflowTemplateItemRecord {
  id: string;
  templateId: string;
  name: string;
  kind: string | null;
  sortOrder: number;
  destinations: Array<{ platform: "telegram" | "youtube" | "instagram"; socialAccountId?: string | null }>;
  dueOffsetMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowEventRecord {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorUserId: string | null;
  source: string;
  reason: string | null;
  createdAt: Date;
}

export interface WorkflowProgramDetail extends WorkflowProgramRecord {
  deliverables: Array<WorkflowDeliverableRecord & { publications: WorkflowPublicationRecord[] }>;
  progress: ReturnType<typeof deriveProgramProgress>;
  nextAction: ReturnType<typeof selectNextAction>;
}

// ---------------------------------------------------------------------------
// Filters / Scopes
// ---------------------------------------------------------------------------
export interface ProgramFilters {
  search?: string;
  ownerUserId?: string;
  includeArchived?: boolean;
}

export interface ProgramScope {
  userId?: string | null;
  allowedAccountIds?: readonly string[] | null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
export interface CreateProgramCommand {
  id?: string;
  title: string;
  seriesName?: string | null;
  ownerUserId?: string | null;
  dueAt?: string | Date | null;
  notes?: string | null;
  source?: string;
  sourceRef?: string | null;
  actorUserId: string;
}

export interface UpdateProgramCommand {
  id: string;
  expectedVersion: number;
  title?: string;
  seriesName?: string | null;
  ownerUserId?: string | null;
  dueAt?: string | Date | null;
  notes?: string | null;
  actorUserId: string;
  reason?: string | null;
}

export interface CreateDeliverableCommand {
  id?: string;
  programId: string;
  name: string;
  kind?: string | null;
  sortOrder?: number;
  assigneeUserId?: string | null;
  dueAt?: string | Date | null;
  notes?: string | null;
  actorUserId: string;
}

export interface TransitionDeliverableCommand {
  id: string;
  expectedVersion: number;
  action: ProductionAction;
  actor: WorkflowActor;
  reason?: string;
  actorUserId: string;
}

export interface TransitionPublicationCommand {
  id: string;
  expectedVersion: number;
  action: PublicationAction;
  actor: WorkflowActor;
  reason?: string;
  actorUserId: string;
  automaticTargetReady?: boolean;
  publishedAt?: string;
  terminalOwner?: TerminalOwner | null;
  overrideTo?: "active" | "do_not_publish";
}

export interface CreateTemplateCommand {
  id?: string;
  name: string;
  description?: string | null;
  actorUserId: string;
  items?: Array<{
    name: string;
    kind?: string | null;
    sortOrder?: number;
    destinations?: Array<{ platform: "telegram" | "youtube" | "instagram"; socialAccountId?: string | null }>;
    dueOffsetMinutes?: number | null;
  }>;
}

export interface InstantiateTemplateCommand {
  templateId: string;
  programId: string;
  actorUserId: string;
  baseDueAt?: string | Date | null;
}

export interface UpdateDeliverableCommand {
  id: string;
  expectedVersion: number;
  name?: string;
  kind?: string | null;
  assigneeUserId?: string | null;
  dueAt?: string | Date | null;
  notes?: string | null;
  sortOrder?: number;
  actorUserId: string;
}

export interface ReorderDeliverablesCommand {
  programId: string;
  orderedIds: string[];
  actorUserId: string;
}

export interface WorkflowImportBatchRecord {
  id: string;
  sheetId: string;
  sheetGid: string | null;
  initiatorUserId: string | null;
  mapping: Record<string, unknown>;
  counts: Record<string, number>;
  results: Array<Record<string, unknown>>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HistoryFilters {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------
export interface WorkflowDatabasePort {
  listPrograms(filters?: ProgramFilters, scope?: ProgramScope): Promise<WorkflowProgramRecord[]>;
  getProgram(id: string): Promise<WorkflowProgramRecord | null>;
  getProgramDetail?(id: string): Promise<WorkflowProgramDetail | null>;
  getDeliverable(id: string): Promise<WorkflowDeliverableRecord | null>;
  getPublication(id: string): Promise<WorkflowPublicationRecord | null>;
  getTemplate(id: string): Promise<WorkflowTemplateRecord | null>;
  listTemplateItems(templateId: string): Promise<WorkflowTemplateItemRecord[]>;
  listDeliverablesForProgram(programId: string): Promise<WorkflowDeliverableRecord[]>;
  listPublicationsForDeliverable(deliverableId: string): Promise<WorkflowPublicationRecord[]>;
  listPublicationsForDeliverables?(deliverableIds: string[]): Promise<WorkflowPublicationRecord[]>;

  transactCreateProgram(program: WorkflowProgramRecord, event: WorkflowEventRecord): Promise<WorkflowProgramRecord>;
  transactUpdateProgram(id: string, expectedVersion: number, patch: Partial<WorkflowProgramRecord>, event: WorkflowEventRecord): Promise<WorkflowProgramRecord>;
  transactCreateDeliverable(deliverable: WorkflowDeliverableRecord, event: WorkflowEventRecord): Promise<WorkflowDeliverableRecord>;
  transactUpdateDeliverable(id: string, expectedVersion: number, patch: Partial<WorkflowDeliverableRecord>, event: WorkflowEventRecord): Promise<WorkflowDeliverableRecord>;
  transactUpdatePublication(id: string, expectedVersion: number, patch: Partial<WorkflowPublicationRecord>, event: WorkflowEventRecord): Promise<WorkflowPublicationRecord>;
  transactCreateTemplate(template: WorkflowTemplateRecord, items: WorkflowTemplateItemRecord[], event: WorkflowEventRecord): Promise<WorkflowTemplateRecord>;
  transactInstantiateTemplate(
    programId: string,
    deliverables: WorkflowDeliverableRecord[],
    publications: WorkflowPublicationRecord[],
    events: WorkflowEventRecord[],
  ): Promise<WorkflowDeliverableRecord[]>;
  listEvents?(filters?: HistoryFilters): Promise<{ items: WorkflowEventRecord[]; total: number }>;
  transactReorderDeliverables?(programId: string, orderedIds: string[], events: WorkflowEventRecord[]): Promise<WorkflowDeliverableRecord[]>;

  // Import batches (transactional failure reporting)
  createImportBatch?(batch: WorkflowImportBatchRecord): Promise<WorkflowImportBatchRecord>;
  updateImportBatch?(id: string, patch: Partial<WorkflowImportBatchRecord>): Promise<WorkflowImportBatchRecord>;
  getImportBatch?(id: string): Promise<WorkflowImportBatchRecord | null>;
}

// ---------------------------------------------------------------------------
// In-Memory port
// ---------------------------------------------------------------------------
export class InMemoryWorkflowPort implements WorkflowDatabasePort {
  programs: WorkflowProgramRecord[] = [];
  deliverables: WorkflowDeliverableRecord[] = [];
  publications: WorkflowPublicationRecord[] = [];
  events: WorkflowEventRecord[] = [];
  templates: WorkflowTemplateRecord[] = [];
  templateItems: WorkflowTemplateItemRecord[] = [];
  batches: WorkflowImportBatchRecord[] = [];
  // for import-service transactional failure injection
  failOnRow?: number | null;
  private batchMap = new Map<string, WorkflowImportBatchRecord>();

  private programMap = new Map<string, WorkflowProgramRecord>();
  private deliverableMap = new Map<string, WorkflowDeliverableRecord>();
  private publicationMap = new Map<string, WorkflowPublicationRecord>();
  private templateMap = new Map<string, WorkflowTemplateRecord>();

  async listPrograms(filters?: ProgramFilters): Promise<WorkflowProgramRecord[]> {
    let result = [...this.programs];
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((p) => p.title.toLowerCase().includes(q) || (p.seriesName ?? "").toLowerCase().includes(q));
    }
    if (filters?.ownerUserId) {
      result = result.filter((p) => p.ownerUserId === filters.ownerUserId);
    }
    if (!filters?.includeArchived) {
      result = result.filter((p) => !p.archivedAt);
    }
    return result;
  }

  async getProgram(id: string): Promise<WorkflowProgramRecord | null> {
    return this.programMap.get(id) ?? null;
  }

  async getDeliverable(id: string): Promise<WorkflowDeliverableRecord | null> {
    return this.deliverableMap.get(id) ?? null;
  }

  async getPublication(id: string): Promise<WorkflowPublicationRecord | null> {
    return this.publicationMap.get(id) ?? null;
  }

  async getTemplate(id: string): Promise<WorkflowTemplateRecord | null> {
    return this.templateMap.get(id) ?? null;
  }

  async listTemplateItems(templateId: string): Promise<WorkflowTemplateItemRecord[]> {
    return this.templateItems.filter((i) => i.templateId === templateId).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async listDeliverablesForProgram(programId: string): Promise<WorkflowDeliverableRecord[]> {
    return this.deliverables.filter((d) => d.programId === programId).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async listPublicationsForDeliverable(deliverableId: string): Promise<WorkflowPublicationRecord[]> {
    return this.publications.filter((p) => p.deliverableId === deliverableId);
  }

  async listPublicationsForDeliverables(deliverableIds: string[]): Promise<WorkflowPublicationRecord[]> {
    const set = new Set(deliverableIds);
    return this.publications.filter((p) => set.has(p.deliverableId));
  }

  async transactCreateProgram(program: WorkflowProgramRecord, event: WorkflowEventRecord): Promise<WorkflowProgramRecord> {
    // atomic: both or none - in-memory we just push both
    this.programMap.set(program.id, program);
    this.programs.push(program);
    this.events.push(event);
    return program;
  }

  async transactUpdateProgram(
    id: string,
    expectedVersion: number,
    patch: Partial<WorkflowProgramRecord>,
    event: WorkflowEventRecord,
  ): Promise<WorkflowProgramRecord> {
    const existing = this.programMap.get(id);
    if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "برنامه یافت نشد.");
    if (existing.version !== expectedVersion) throw new WorkflowRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
    const updated: WorkflowProgramRecord = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: (patch.updatedAt as Date) ?? new Date(),
    };
    this.programMap.set(id, updated);
    const idx = this.programs.findIndex((p) => p.id === id);
    if (idx >= 0) this.programs[idx] = updated;
    this.events.push(event);
    // ensure event after reflects new version
    event.after = serializeRecord(updated) as Record<string, unknown>;
    return updated;
  }

  async transactCreateDeliverable(deliverable: WorkflowDeliverableRecord, event: WorkflowEventRecord): Promise<WorkflowDeliverableRecord> {
    this.deliverableMap.set(deliverable.id, deliverable);
    this.deliverables.push(deliverable);
    this.events.push(event);
    return deliverable;
  }

  async transactUpdateDeliverable(
    id: string,
    expectedVersion: number,
    patch: Partial<WorkflowDeliverableRecord>,
    event: WorkflowEventRecord,
  ): Promise<WorkflowDeliverableRecord> {
    const existing = this.deliverableMap.get(id);
    if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "خروجی یافت نشد.");
    if (existing.version !== expectedVersion) throw new WorkflowRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
    const updated: WorkflowDeliverableRecord = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: (patch.updatedAt as Date) ?? new Date(),
    };
    this.deliverableMap.set(id, updated);
    const idx = this.deliverables.findIndex((d) => d.id === id);
    if (idx >= 0) this.deliverables[idx] = updated;
    this.events.push(event);
    event.after = serializeRecord(updated) as Record<string, unknown>;
    return updated;
  }

  async transactUpdatePublication(
    id: string,
    expectedVersion: number,
    patch: Partial<WorkflowPublicationRecord>,
    event: WorkflowEventRecord,
  ): Promise<WorkflowPublicationRecord> {
    const existing = this.publicationMap.get(id);
    if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "انتشار یافت نشد.");
    if (existing.version !== expectedVersion) throw new WorkflowRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
    const updated: WorkflowPublicationRecord = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: (patch.updatedAt as Date) ?? new Date(),
    };
    this.publicationMap.set(id, updated);
    const idx = this.publications.findIndex((p) => p.id === id);
    if (idx >= 0) this.publications[idx] = updated;
    this.events.push(event);
    event.after = serializeRecord(updated) as Record<string, unknown>;
    return updated;
  }

  async transactCreateTemplate(
    template: WorkflowTemplateRecord,
    items: WorkflowTemplateItemRecord[],
    event: WorkflowEventRecord,
  ): Promise<WorkflowTemplateRecord> {
    this.templateMap.set(template.id, template);
    this.templates.push(template);
    for (const item of items) this.templateItems.push(item);
    this.events.push(event);
    return template;
  }

  async transactInstantiateTemplate(
    _programId: string,
    deliverables: WorkflowDeliverableRecord[],
    publications: WorkflowPublicationRecord[],
    events: WorkflowEventRecord[],
  ): Promise<WorkflowDeliverableRecord[]> {
    for (const d of deliverables) {
      this.deliverableMap.set(d.id, d);
      this.deliverables.push(d);
    }
    for (const p of publications) {
      this.publicationMap.set(p.id, p);
      this.publications.push(p);
    }
    for (const e of events) this.events.push(e);
    return deliverables;
  }

  async listEvents(filters?: HistoryFilters): Promise<{ items: WorkflowEventRecord[]; total: number }> {
    let filtered = [...this.events];
    if (filters?.entityType) filtered = filtered.filter((e) => e.entityType === filters.entityType);
    if (filters?.entityId) filtered = filtered.filter((e) => e.entityId === filters.entityId);
    if (filters?.actorUserId) filtered = filtered.filter((e) => e.actorUserId === filters.actorUserId);
    // newest first
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = filtered.length;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize);
    return { items, total };
  }

  async transactReorderDeliverables(programId: string, orderedIds: string[], events: WorkflowEventRecord[]): Promise<WorkflowDeliverableRecord[]> {
    // validate all belong to program
    const programDeliverables = this.deliverables.filter((d) => d.programId === programId);
    const idsSet = new Set(programDeliverables.map((d) => d.id));
    if (orderedIds.length !== programDeliverables.length || !orderedIds.every((id) => idsSet.has(id))) {
      throw new WorkflowRepositoryError("INVALID_TRANSITION" as never, "ترتیب نامعتبر است.");
    }
    const updated: WorkflowDeliverableRecord[] = [];
    const now = new Date();
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const existing = this.deliverableMap.get(id)!;
      const next: WorkflowDeliverableRecord = { ...existing, sortOrder: i, version: existing.version + 1, updatedAt: now };
      this.deliverableMap.set(id, next);
      const idx = this.deliverables.findIndex((d) => d.id === id);
      if (idx >= 0) this.deliverables[idx] = next;
      updated.push(next);
    }
    for (const e of events) this.events.push(e);
    return updated.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createImportBatch(batch: WorkflowImportBatchRecord): Promise<WorkflowImportBatchRecord> {
    this.batchMap.set(batch.id, batch);
    this.batches.push(batch);
    return batch;
  }

  async updateImportBatch(id: string, patch: Partial<WorkflowImportBatchRecord>): Promise<WorkflowImportBatchRecord> {
    const existing = this.batchMap.get(id);
    if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "batch یافت نشد.");
    const updated = { ...existing, ...patch, updatedAt: (patch.updatedAt as Date) ?? new Date() };
    this.batchMap.set(id, updated);
    const idx = this.batches.findIndex((b) => b.id === id);
    if (idx >= 0) this.batches[idx] = updated;
    return updated;
  }

  async getImportBatch(id: string): Promise<WorkflowImportBatchRecord | null> {
    return this.batchMap.get(id) ?? null;
  }
}

function serializeRecord(record: unknown): unknown {
  // shallow copy for event after/before
  if (record && typeof record === "object") return { ...(record as Record<string, unknown>) };
  return record;
}

// ---------------------------------------------------------------------------
// Drizzle port
// ---------------------------------------------------------------------------
export function createDrizzleWorkflowPort(): WorkflowDatabasePort {
  // lazy helper to avoid importing db when DATABASE_URL missing in tests
  const getDb = async () => {
    const { db } = await import("@/db");
    return db;
  };

  return {
    async listPrograms(filters, _scope) {
      const db = await getDb();
      const { workflowPrograms } = await import("@/db/schema");
      const { eq, isNull, like, and, sql } = await import("drizzle-orm");
      const conditions: unknown[] = [];
      if (filters?.search) {
        // drizzle like with %search%
        conditions.push(sql`${workflowPrograms.title} ILIKE ${"%" + filters.search + "%"}`);
      }
      if (filters?.ownerUserId) conditions.push(eq(workflowPrograms.ownerUserId, filters.ownerUserId));
      if (!filters?.includeArchived) conditions.push(isNull(workflowPrograms.archivedAt));
      // fetch
      const rows = await (conditions.length
        ? db.select().from(workflowPrograms).where(and(...(conditions as never[])))
        : db.select().from(workflowPrograms).where(isNull(workflowPrograms.archivedAt)));
      return rows.map(mapProgramRow);
    },

    async getProgram(id) {
      const db = await getDb();
      const { workflowPrograms } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(workflowPrograms).where(eq(workflowPrograms.id, id)).limit(1);
      return row ? mapProgramRow(row) : null;
    },

    async getDeliverable(id) {
      const db = await getDb();
      const { workflowDeliverables } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(workflowDeliverables).where(eq(workflowDeliverables.id, id)).limit(1);
      return row ? mapDeliverableRow(row) : null;
    },

    async getPublication(id) {
      const db = await getDb();
      const { workflowPublications } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(workflowPublications).where(eq(workflowPublications.id, id)).limit(1);
      return row ? mapPublicationRow(row) : null;
    },

    async getTemplate(id) {
      const db = await getDb();
      const { workflowTemplates } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(workflowTemplates).where(eq(workflowTemplates.id, id)).limit(1);
      return row ? mapTemplateRow(row) : null;
    },

    async listTemplateItems(templateId) {
      const db = await getDb();
      const { workflowTemplateItems } = await import("@/db/schema");
      const { eq, asc } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(workflowTemplateItems)
        .where(eq(workflowTemplateItems.templateId, templateId))
        .orderBy(asc(workflowTemplateItems.sortOrder));
      return rows.map(mapTemplateItemRow);
    },

    async listDeliverablesForProgram(programId) {
      const db = await getDb();
      const { workflowDeliverables } = await import("@/db/schema");
      const { eq, asc } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(workflowDeliverables)
        .where(eq(workflowDeliverables.programId, programId))
        .orderBy(asc(workflowDeliverables.sortOrder));
      return rows.map(mapDeliverableRow);
    },

    async listPublicationsForDeliverable(deliverableId) {
      const db = await getDb();
      const { workflowPublications } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await db.select().from(workflowPublications).where(eq(workflowPublications.deliverableId, deliverableId));
      return rows.map(mapPublicationRow);
    },

    async transactCreateProgram(program, event) {
      const db = await getDb();
      const { workflowPrograms, workflowEvents } = await import("@/db/schema");
      return db.transaction(async (tx) => {
        const [inserted] = await tx.insert(workflowPrograms).values(toProgramInsert(program) as never).returning();
        if (!inserted) throw new WorkflowRepositoryError("NOT_FOUND", "خطا در ایجاد برنامه.");
        await tx.insert(workflowEvents).values(toEventInsert(event) as never);
        return mapProgramRow(inserted);
      });
    },

    async transactUpdateProgram(id, expectedVersion, patch, event) {
      const db = await getDb();
      const { workflowPrograms, workflowEvents } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      return db.transaction(async (tx) => {
        const setPatch = toProgramPatch(patch, expectedVersion);
        const [updated] = await tx
          .update(workflowPrograms)
          .set(setPatch as never)
          .where(and(eq(workflowPrograms.id, id), eq(workflowPrograms.version, expectedVersion)))
          .returning();
        if (updated) {
          await tx.insert(workflowEvents).values(toEventInsert(event) as never);
          return mapProgramRow(updated);
        }
        // distinguish not-found vs conflict
        const [existing] = await tx.select({ id: workflowPrograms.id }).from(workflowPrograms).where(eq(workflowPrograms.id, id)).limit(1);
        if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "برنامه یافت نشد.");
        throw new WorkflowRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
      });
    },

    async transactCreateDeliverable(deliverable, event) {
      const db = await getDb();
      const { workflowDeliverables, workflowEvents } = await import("@/db/schema");
      return db.transaction(async (tx) => {
        const [inserted] = await tx.insert(workflowDeliverables).values(toDeliverableInsert(deliverable) as never).returning();
        if (!inserted) throw new WorkflowRepositoryError("NOT_FOUND", "خطا در ایجاد خروجی.");
        await tx.insert(workflowEvents).values(toEventInsert(event) as never);
        return mapDeliverableRow(inserted);
      });
    },

    async transactUpdateDeliverable(id, expectedVersion, patch, event) {
      const db = await getDb();
      const { workflowDeliverables, workflowEvents } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      return db.transaction(async (tx) => {
        const setPatch = toDeliverablePatch(patch, expectedVersion);
        const [updated] = await tx
          .update(workflowDeliverables)
          .set(setPatch as never)
          .where(and(eq(workflowDeliverables.id, id), eq(workflowDeliverables.version, expectedVersion)))
          .returning();
        if (updated) {
          await tx.insert(workflowEvents).values(toEventInsert(event) as never);
          return mapDeliverableRow(updated);
        }
        const [existing] = await tx.select({ id: workflowDeliverables.id }).from(workflowDeliverables).where(eq(workflowDeliverables.id, id)).limit(1);
        if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "خروجی یافت نشد.");
        throw new WorkflowRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
      });
    },

    async transactUpdatePublication(id, expectedVersion, patch, event) {
      const db = await getDb();
      const { workflowPublications, workflowEvents } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      return db.transaction(async (tx) => {
        const setPatch = toPublicationPatch(patch, expectedVersion);
        const [updated] = await tx
          .update(workflowPublications)
          .set(setPatch as never)
          .where(and(eq(workflowPublications.id, id), eq(workflowPublications.version, expectedVersion)))
          .returning();
        if (updated) {
          await tx.insert(workflowEvents).values(toEventInsert(event) as never);
          return mapPublicationRow(updated);
        }
        const [existing] = await tx.select({ id: workflowPublications.id }).from(workflowPublications).where(eq(workflowPublications.id, id)).limit(1);
        if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "انتشار یافت نشد.");
        throw new WorkflowRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
      });
    },

    async transactCreateTemplate(template, items, event) {
      const db = await getDb();
      const { workflowTemplates, workflowTemplateItems, workflowEvents } = await import("@/db/schema");
      return db.transaction(async (tx) => {
        const [inserted] = await tx.insert(workflowTemplates).values(toTemplateInsert(template) as never).returning();
        if (!inserted) throw new WorkflowRepositoryError("NOT_FOUND", "خطا در ایجاد الگو.");
        if (items.length) await tx.insert(workflowTemplateItems).values(items.map(toTemplateItemInsert) as never);
        await tx.insert(workflowEvents).values(toEventInsert(event) as never);
        return mapTemplateRow(inserted);
      });
    },

    async transactInstantiateTemplate(_programId, deliverables, publications, events) {
      const db = await getDb();
      const { workflowDeliverables, workflowPublications, workflowEvents } = await import("@/db/schema");
      return db.transaction(async (tx) => {
        if (deliverables.length) await tx.insert(workflowDeliverables).values(deliverables.map(toDeliverableInsert) as never);
        if (publications.length) await tx.insert(workflowPublications).values(publications.map(toPublicationInsert) as never);
        if (events.length) await tx.insert(workflowEvents).values(events.map(toEventInsert) as never);
        return deliverables;
      });
    },

    async listEvents(filters) {
      const db = await getDb();
      const { workflowEvents } = await import("@/db/schema");
      const { eq, and, desc, sql } = await import("drizzle-orm");
      const conditions: unknown[] = [];
      if (filters?.entityType) conditions.push(eq(workflowEvents.entityType, filters.entityType));
      if (filters?.entityId) conditions.push(eq(workflowEvents.entityId, filters.entityId));
      if (filters?.actorUserId) conditions.push(eq(workflowEvents.actorUserId, filters.actorUserId));
      const where = conditions.length ? and(...(conditions as never[])) : undefined;
      const page = filters?.page ?? 1;
      const pageSize = filters?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;
      const rows = await db
        .select()
        .from(workflowEvents)
        .where(where as never)
        .orderBy(desc(workflowEvents.createdAt))
        .limit(pageSize)
        .offset(offset);
      const totalRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(workflowEvents)
        .where(where as never);
      const total = Number((totalRows[0] as unknown as { count: number }).count ?? 0);
      return {
        items: rows.map((r) => ({
          id: (r as unknown as { id: string }).id as string,
          entityType: ((r as unknown as Record<string, unknown>).entityType as string) ?? ((r as unknown as Record<string, unknown>).entity_type as string),
          entityId: ((r as unknown as Record<string, unknown>).entityId as string) ?? ((r as unknown as Record<string, unknown>).entity_id as string),
          action: (r as unknown as { action: string }).action as string,
          before: ((r as unknown as { before: unknown }).before as Record<string, unknown> | null) ?? null,
          after: ((r as unknown as { after: unknown }).after as Record<string, unknown> | null) ?? null,
          actorUserId: ((r as unknown as Record<string, unknown>).actorUserId as string | null) ?? ((r as unknown as Record<string, unknown>).actor_user_id as string | null) ?? null,
          source: (r as unknown as { source: string }).source as string,
          reason: ((r as unknown as { reason: string | null }).reason as string | null) ?? null,
          createdAt: ((r as unknown as Record<string, unknown>).createdAt as Date) ?? ((r as unknown as Record<string, unknown>).created_at as Date),
        })) as WorkflowEventRecord[],
        total,
      };
    },

    async transactReorderDeliverables(programId, orderedIds, events) {
      const db = await getDb();
      const { workflowDeliverables, workflowEvents } = await import("@/db/schema");
      const { eq, inArray } = await import("drizzle-orm");
      return db.transaction(async (tx) => {
        const existing = await tx.select().from(workflowDeliverables).where(eq(workflowDeliverables.programId, programId));
        const existingIds = new Set(existing.map((r) => r.id as string));
        if (orderedIds.length !== existing.length || !orderedIds.every((id) => existingIds.has(id))) {
          throw new WorkflowRepositoryError("INVALID_TRANSITION" as never, "ترتیب نامعتبر است.");
        }
        const updates: WorkflowDeliverableRecord[] = [];
        for (let i = 0; i < orderedIds.length; i++) {
          const id = orderedIds[i];
          const [updated] = await tx
            .update(workflowDeliverables)
            .set({ sortOrder: i, updatedAt: new Date(), version: (existing.find((r) => (r.id as string) === id) as unknown as { version: number }).version + 1 } as never)
            .where(eq(workflowDeliverables.id, id) as never)
            .returning();
          if (updated) updates.push(mapDeliverableRow(updated));
        }
        if (events.length) await tx.insert(workflowEvents).values(events.map(toEventInsert) as never);
        return updates.sort((a, b) => a.sortOrder - b.sortOrder);
      });
    },

    async createImportBatch(batch) {
      const db = await getDb();
      const { workflowImportBatches } = await import("@/db/schema");
      const [inserted] = await db.insert(workflowImportBatches).values(batch as never).returning();
      return inserted as unknown as WorkflowImportBatchRecord;
    },
    async updateImportBatch(id, patch) {
      const db = await getDb();
      const { workflowImportBatches } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db
        .update(workflowImportBatches)
        .set({ ...patch, updatedAt: new Date() } as never)
        .where(eq(workflowImportBatches.id, id) as never)
        .returning();
      if (!updated) throw new WorkflowRepositoryError("NOT_FOUND", "batch یافت نشد.");
      return updated as unknown as WorkflowImportBatchRecord;
    },
    async getImportBatch(id) {
      const db = await getDb();
      const { workflowImportBatches } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(workflowImportBatches).where(eq(workflowImportBatches.id, id)).limit(1);
      return (row as unknown as WorkflowImportBatchRecord) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Row mappers (drizzle snake_case -> camelCase)
// ---------------------------------------------------------------------------
function mapProgramRow(row: Record<string, unknown>): WorkflowProgramRecord {
  return {
    id: row.id as string,
    title: row.title as string,
    seriesName: (row.seriesName as string | null) ?? (row.series_name as string | null) ?? null,
    ownerUserId: (row.ownerUserId as string | null) ?? (row.owner_user_id as string | null) ?? null,
    dueAt: (row.dueAt as Date | null) ?? (row.due_at as Date | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    source: (row.source as string) ?? "manual",
    sourceRef: (row.sourceRef as string | null) ?? (row.source_ref as string | null) ?? null,
    version: row.version as number,
    createdBy: (row.createdBy as string | null) ?? (row.created_by as string | null) ?? null,
    createdAt: (row.createdAt as Date) ?? (row.created_at as Date),
    updatedAt: (row.updatedAt as Date) ?? (row.updated_at as Date),
    archivedAt: (row.archivedAt as Date | null) ?? (row.archived_at as Date | null) ?? null,
  };
}
function mapDeliverableRow(row: Record<string, unknown>): WorkflowDeliverableRecord {
  return {
    id: row.id as string,
    programId: (row.programId as string) ?? (row.program_id as string),
    name: row.name as string,
    kind: (row.kind as string | null) ?? null,
    sortOrder: (row.sortOrder as number) ?? (row.sort_order as number) ?? 0,
    productionStatus: ((row.productionStatus as string) ?? (row.production_status as string)) as ProductionStatus,
    assigneeUserId: (row.assigneeUserId as string | null) ?? (row.assignee_user_id as string | null) ?? null,
    dueAt: (row.dueAt as Date | null) ?? (row.due_at as Date | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    contentId: (row.contentId as string | null) ?? (row.content_id as string | null) ?? null,
    fileRef: (row.fileRef as string | null) ?? (row.file_ref as string | null) ?? null,
    archivedAt: (row.archivedAt as Date | null) ?? (row.archived_at as Date | null) ?? null,
    version: row.version as number,
    createdBy: (row.createdBy as string | null) ?? (row.created_by as string | null) ?? null,
    createdAt: (row.createdAt as Date) ?? (row.created_at as Date),
    updatedAt: (row.updatedAt as Date) ?? (row.updated_at as Date),
  };
}
function mapPublicationRow(row: Record<string, unknown>): WorkflowPublicationRecord {
  return {
    id: row.id as string,
    deliverableId: (row.deliverableId as string) ?? (row.deliverable_id as string),
    platform: row.platform as string,
    socialAccountId: (row.socialAccountId as string | null) ?? (row.social_account_id as string | null) ?? null,
    status: ((row.status as string) ?? "waiting_for_production") as PublicationStatus,
    createdSource: (row.createdSource as string) ?? (row.created_source as string) ?? "manual",
    terminalOwner: (row.terminalOwner as string | null) ?? (row.terminal_owner as string | null) ?? null,
    scheduledAt: (row.scheduledAt as Date | null) ?? (row.scheduled_at as Date | null) ?? null,
    publishedAt: (row.publishedAt as Date | null) ?? (row.published_at as Date | null) ?? null,
    externalId: (row.externalId as string | null) ?? (row.external_id as string | null) ?? null,
    permalink: (row.permalink as string | null) ?? null,
    lastErrorCode: (row.lastErrorCode as string | null) ?? (row.last_error_code as string | null) ?? null,
    lastErrorMessage: (row.lastErrorMessage as string | null) ?? (row.last_error_message as string | null) ?? null,
    manualReason: (row.manualReason as string | null) ?? (row.manual_reason as string | null) ?? null,
    version: row.version as number,
    updatedBy: (row.updatedBy as string | null) ?? (row.updated_by as string | null) ?? null,
    createdAt: (row.createdAt as Date) ?? (row.created_at as Date),
    updatedAt: (row.updatedAt as Date) ?? (row.updated_at as Date),
  };
}
function mapTemplateRow(row: Record<string, unknown>): WorkflowTemplateRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    active: (row.active as boolean) ?? true,
    createdBy: (row.createdBy as string | null) ?? (row.created_by as string | null) ?? null,
    createdAt: (row.createdAt as Date) ?? (row.created_at as Date),
    updatedAt: (row.updatedAt as Date) ?? (row.updated_at as Date),
    archivedAt: (row.archivedAt as Date | null) ?? (row.archived_at as Date | null) ?? null,
  };
}
function mapTemplateItemRow(row: Record<string, unknown>): WorkflowTemplateItemRecord {
  return {
    id: row.id as string,
    templateId: (row.templateId as string) ?? (row.template_id as string),
    name: row.name as string,
    kind: (row.kind as string | null) ?? null,
    sortOrder: (row.sortOrder as number) ?? (row.sort_order as number) ?? 0,
    destinations: ((row.destinations as unknown) ?? (row.destinations as unknown) ?? []) as WorkflowTemplateItemRecord["destinations"],
    dueOffsetMinutes: (row.dueOffsetMinutes as number | null) ?? (row.due_offset_minutes as number | null) ?? null,
    createdAt: (row.createdAt as Date) ?? (row.created_at as Date),
    updatedAt: (row.updatedAt as Date) ?? (row.updated_at as Date),
  };
}

// insert helpers
function toProgramInsert(p: WorkflowProgramRecord): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    seriesName: p.seriesName,
    ownerUserId: p.ownerUserId,
    dueAt: p.dueAt,
    notes: p.notes,
    source: p.source,
    sourceRef: p.sourceRef,
    version: p.version,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    archivedAt: p.archivedAt,
  };
}
function toProgramPatch(patch: Partial<WorkflowProgramRecord>, expectedVersion: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.seriesName !== undefined) out.seriesName = patch.seriesName;
  if (patch.ownerUserId !== undefined) out.ownerUserId = patch.ownerUserId;
  if (patch.dueAt !== undefined) out.dueAt = patch.dueAt;
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.archivedAt !== undefined) out.archivedAt = patch.archivedAt;
  out.version = expectedVersion + 1;
  out.updatedAt = patch.updatedAt ?? new Date();
  return out;
}
function toDeliverableInsert(d: WorkflowDeliverableRecord): Record<string, unknown> {
  return {
    id: d.id,
    programId: d.programId,
    name: d.name,
    kind: d.kind,
    sortOrder: d.sortOrder,
    productionStatus: d.productionStatus,
    assigneeUserId: d.assigneeUserId,
    dueAt: d.dueAt,
    notes: d.notes,
    contentId: d.contentId,
    fileRef: d.fileRef,
    archivedAt: d.archivedAt,
    version: d.version,
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
function toDeliverablePatch(patch: Partial<WorkflowDeliverableRecord>, expectedVersion: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.kind !== undefined) out.kind = patch.kind;
  if (patch.sortOrder !== undefined) out.sortOrder = patch.sortOrder;
  if (patch.productionStatus !== undefined) out.productionStatus = patch.productionStatus;
  if (patch.assigneeUserId !== undefined) out.assigneeUserId = patch.assigneeUserId;
  if (patch.dueAt !== undefined) out.dueAt = patch.dueAt;
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.contentId !== undefined) out.contentId = patch.contentId;
  if (patch.fileRef !== undefined) out.file_ref = patch.fileRef;
  if (patch.archivedAt !== undefined) out.archivedAt = patch.archivedAt;
  out.version = expectedVersion + 1;
  out.updatedAt = patch.updatedAt ?? new Date();
  return out;
}
function toPublicationInsert(p: WorkflowPublicationRecord): Record<string, unknown> {
  return {
    id: p.id,
    deliverableId: p.deliverableId,
    platform: p.platform,
    socialAccountId: p.socialAccountId,
    status: p.status,
    createdSource: p.createdSource,
    terminalOwner: p.terminalOwner,
    scheduledAt: p.scheduledAt,
    publishedAt: p.publishedAt,
    externalId: p.externalId,
    permalink: p.permalink,
    lastErrorCode: p.lastErrorCode,
    lastErrorMessage: p.lastErrorMessage,
    manualReason: p.manualReason,
    version: p.version,
    updatedBy: p.updatedBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
function toPublicationPatch(patch: Partial<WorkflowPublicationRecord>, expectedVersion: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.socialAccountId !== undefined) out.socialAccountId = patch.socialAccountId;
  if (patch.terminalOwner !== undefined) out.terminalOwner = patch.terminalOwner;
  if (patch.scheduledAt !== undefined) out.scheduledAt = patch.scheduledAt;
  if (patch.publishedAt !== undefined) out.publishedAt = patch.publishedAt;
  if (patch.externalId !== undefined) out.externalId = patch.externalId;
  if (patch.permalink !== undefined) out.permalink = patch.permalink;
  if (patch.lastErrorCode !== undefined) out.lastErrorCode = patch.lastErrorCode;
  if (patch.lastErrorMessage !== undefined) out.lastErrorMessage = patch.lastErrorMessage;
  if (patch.manualReason !== undefined) out.manualReason = patch.manualReason;
  if (patch.updatedBy !== undefined) out.updatedBy = patch.updatedBy;
  out.version = expectedVersion + 1;
  out.updatedAt = patch.updatedAt ?? new Date();
  return out;
}
function toTemplateInsert(t: WorkflowTemplateRecord): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    active: t.active,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    archivedAt: t.archivedAt,
  };
}
function toTemplateItemInsert(i: WorkflowTemplateItemRecord): Record<string, unknown> {
  return {
    id: i.id,
    templateId: i.templateId,
    name: i.name,
    kind: i.kind,
    sortOrder: i.sortOrder,
    destinations: i.destinations,
    dueOffsetMinutes: i.dueOffsetMinutes,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}
function toEventInsert(e: WorkflowEventRecord): Record<string, unknown> {
  return {
    id: e.id,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    before: e.before,
    after: e.after,
    actorUserId: e.actorUserId,
    source: e.source,
    reason: e.reason,
    createdAt: e.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------
export interface WorkflowRepository {
  listPrograms(filters?: ProgramFilters, scope?: ProgramScope): Promise<WorkflowProgramRecord[]>;
  getProgram(id: string): Promise<WorkflowProgramDetail | null>;
  createProgram(command: CreateProgramCommand): Promise<WorkflowProgramRecord>;
  updateProgram(command: UpdateProgramCommand): Promise<WorkflowProgramRecord>;
  createDeliverable(command: CreateDeliverableCommand): Promise<WorkflowDeliverableRecord>;
  updateDeliverable(command: UpdateDeliverableCommand): Promise<WorkflowDeliverableRecord>;
  reorderDeliverables(command: ReorderDeliverablesCommand): Promise<WorkflowDeliverableRecord[]>;
  getDeliverable(id: string): Promise<WorkflowDeliverableRecord | null>;
  getPublication(id: string): Promise<WorkflowPublicationRecord | null>;
  transitionDeliverable(command: TransitionDeliverableCommand): Promise<WorkflowDeliverableRecord>;
  transitionPublication(command: TransitionPublicationCommand): Promise<WorkflowPublicationRecord>;
  createTemplate(command: CreateTemplateCommand): Promise<WorkflowTemplateRecord>;
  instantiateTemplate(command: InstantiateTemplateCommand): Promise<WorkflowDeliverableRecord[]>;
  listHistory(filters: HistoryFilters): Promise<{ items: WorkflowEventRecord[]; total: number; page: number; pageSize: number }>;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calculateDueAt(base: Date | null, offsetMinutes: number | null): Date | null {
  if (!base || offsetMinutes == null) return null;
  return new Date(base.getTime() + offsetMinutes * 60 * 1000);
}

export function createWorkflowRepository(port?: WorkflowDatabasePort): WorkflowRepository {
  const dbPort: WorkflowDatabasePort = port ?? createDrizzleWorkflowPort();

  return {
    async listPrograms(filters, scope) {
      const programs = await dbPort.listPrograms(filters, scope);
      return programs;
    },

    async getProgram(id) {
      const program = await dbPort.getProgram(id);
      if (!program) return null;
      const deliverables = await dbPort.listDeliverablesForProgram(id);
      const pubsByDeliverable = new Map<string, WorkflowPublicationRecord[]>();
      if (deliverables.length) {
        const allPubs = dbPort.listPublicationsForDeliverables
          ? await dbPort.listPublicationsForDeliverables(deliverables.map((d) => d.id))
          : (
              await Promise.all(deliverables.map((d) => dbPort.listPublicationsForDeliverable(d.id)))
            ).flat();
        for (const pub of allPubs) {
          const list = pubsByDeliverable.get(pub.deliverableId) ?? [];
          list.push(pub);
          pubsByDeliverable.set(pub.deliverableId, list);
        }
      }
      const enrichedDeliverables = deliverables.map((d) => ({
        ...d,
        publications: pubsByDeliverable.get(d.id) ?? [],
      }));
      // derive progress using progress helpers
      const progressInput = enrichedDeliverables.map((d) => ({
        id: d.id,
        status: d.productionStatus as ProductionStatus,
        createdAt: d.createdAt,
        statusChangedAt: d.updatedAt,
        dueAt: d.dueAt,
        archivedAt: d.archivedAt,
        publications: d.publications.map((p) => ({
          id: p.id,
          status: p.status as PublicationStatus,
          createdAt: p.createdAt,
          statusChangedAt: p.updatedAt,
          scheduledAt: p.scheduledAt,
        })),
      }));
      const progress = deriveProgramProgress(progressInput);
      const nextAction = selectNextAction(progressInput, new Date());
      return { ...program, deliverables: enrichedDeliverables, progress, nextAction };
    },

    async createProgram(command) {
      const now = new Date();
      const id = command.id ?? generateEntityId("WPR");
      const program: WorkflowProgramRecord = {
        id,
        title: command.title,
        seriesName: command.seriesName ?? null,
        ownerUserId: command.ownerUserId ?? null,
        dueAt: toDate(command.dueAt),
        notes: command.notes ?? null,
        source: command.source ?? "manual",
        sourceRef: command.sourceRef ?? null,
        version: 1,
        createdBy: command.actorUserId,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      };
      const event: WorkflowEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "workflow_program",
        entityId: id,
        action: "created",
        before: null,
        after: { ...program } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      };
      return dbPort.transactCreateProgram(program, event);
    },

    async updateProgram(command) {
      const now = new Date();
      const existing = await dbPort.getProgram(command.id);
      if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "برنامه یافت نشد.");
      const patch: Partial<WorkflowProgramRecord> = {
        updatedAt: now,
      };
      if (command.title !== undefined) patch.title = command.title;
      if (command.seriesName !== undefined) patch.seriesName = command.seriesName;
      if (command.ownerUserId !== undefined) patch.ownerUserId = command.ownerUserId;
      if (command.dueAt !== undefined) patch.dueAt = toDate(command.dueAt);
      if (command.notes !== undefined) patch.notes = command.notes;
      const after = { ...existing, ...patch, version: existing.version + 1, updatedAt: now };
      const event: WorkflowEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "workflow_program",
        entityId: command.id,
        action: "updated",
        before: { ...existing } as unknown as Record<string, unknown>,
        after: { ...after } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: command.reason ?? null,
        createdAt: now,
      };
      return dbPort.transactUpdateProgram(command.id, command.expectedVersion, patch, event);
    },

    async createDeliverable(command) {
      const now = new Date();
      // ensure program exists
      const program = await dbPort.getProgram(command.programId);
      if (!program) throw new WorkflowRepositoryError("NOT_FOUND", "برنامه یافت نشد.");
      const existing = await dbPort.listDeliverablesForProgram(command.programId);
      const maxOrder = existing.reduce((m, d) => Math.max(m, d.sortOrder), -1);
      const id = command.id ?? generateEntityId("WDL");
      const deliverable: WorkflowDeliverableRecord = {
        id,
        programId: command.programId,
        name: command.name,
        kind: command.kind ?? null,
        sortOrder: command.sortOrder ?? maxOrder + 1,
        productionStatus: "not_started",
        assigneeUserId: command.assigneeUserId ?? null,
        dueAt: toDate(command.dueAt),
        notes: command.notes ?? null,
        contentId: null,
        fileRef: null,
        archivedAt: null,
        version: 1,
        createdBy: command.actorUserId,
        createdAt: now,
        updatedAt: now,
      };
      const event: WorkflowEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "workflow_deliverable",
        entityId: id,
        action: "created",
        before: null,
        after: { ...deliverable } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      };
      const created = await dbPort.transactCreateDeliverable(deliverable, event);
      // Enqueue due reminder (24h before due) and assignment notification best-effort
      void (async () => {
        try {
          if (created.dueAt) {
            const { enqueueWorkflowNotificationDb } = await import("./notifications");
            await enqueueWorkflowNotificationDb({
              type: "due_24h",
              deliverableId: created.id,
              dueAt: created.dueAt,
              assigneeUserId: created.assigneeUserId ?? undefined,
              recipientUserId: created.assigneeUserId ?? undefined,
              payload: { deliverableName: created.name, dueAt: created.dueAt.toISOString() },
            });
            console.log(`[workflow-notifications] due reminder scheduled for new deliverable ${created.id} due ${created.dueAt.toISOString()}`);
          }
          if (created.assigneeUserId) {
            try {
              const { enqueueWorkflowNotificationDb } = await import("./notifications");
              await enqueueWorkflowNotificationDb({
                type: "assignment",
                deliverableId: created.id,
                assigneeUserId: created.assigneeUserId,
                version: created.version,
                recipientUserId: created.assigneeUserId,
                payload: { deliverableName: created.name },
              });
            } catch {}
          }
        } catch (err) {
          console.error("[workflow-notifications] createDeliverable enqueue failed:", (err as Error).message);
        }
      })();
      return created;
    },

    async updateDeliverable(command) {
      const now = new Date();
      const existing = await dbPort.getDeliverable(command.id);
      if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "خروجی یافت نشد.");
      const patch: Partial<WorkflowDeliverableRecord> = { updatedAt: now };
      if (command.name !== undefined) patch.name = command.name;
      if (command.kind !== undefined) patch.kind = command.kind;
      if (command.assigneeUserId !== undefined) patch.assigneeUserId = command.assigneeUserId;
      if (command.dueAt !== undefined) patch.dueAt = toDate(command.dueAt);
      if (command.notes !== undefined) patch.notes = command.notes;
      if (command.sortOrder !== undefined) patch.sortOrder = command.sortOrder;
      const after = { ...existing, ...patch, version: existing.version + 1, updatedAt: now };
      const event: WorkflowEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "workflow_deliverable",
        entityId: command.id,
        action: "updated",
        before: { ...existing } as unknown as Record<string, unknown>,
        after: { ...after } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      };
      const updated = await dbPort.transactUpdateDeliverable(command.id, command.expectedVersion, patch, event);
      // Handle due date change: cancel old due notification, schedule new; handle assignee change
      void (async () => {
        try {
          const oldDue = existing.dueAt;
          const newDue = (patch.dueAt !== undefined ? patch.dueAt : existing.dueAt) as Date | null;
          const oldDueIso = oldDue ? (oldDue instanceof Date ? oldDue.toISOString() : String(oldDue)) : null;
          const newDueIso = newDue ? (newDue instanceof Date ? newDue.toISOString() : String(newDue)) : null;
          if (oldDueIso !== newDueIso) {
            if (oldDue) {
              try {
                const { cancelDueNotification } = await import("./notifications");
                // In-memory fallback: if port has notifications array, cancel via helper; otherwise DB cancel handled inside cancelDueNotification
                const maybePort = dbPort as unknown as { notifications?: unknown[] };
                if (maybePort.notifications) {
                  await cancelDueNotification(maybePort as never, updated.id, oldDue as Date);
                } else {
                  // DB cancel via cancelDueNotification (it does DB update)
                  const fakePort: { notifications: unknown[] } = { notifications: [] };
                  await cancelDueNotification(fakePort as never, updated.id, oldDue as Date);
                }
              } catch {}
            }
            if (newDue) {
              const { enqueueWorkflowNotificationDb } = await import("./notifications");
              await enqueueWorkflowNotificationDb({
                type: "due_24h",
                deliverableId: updated.id,
                dueAt: newDue as Date,
                assigneeUserId: (updated.assigneeUserId as string) ?? undefined,
                recipientUserId: (updated.assigneeUserId as string) ?? undefined,
                payload: { deliverableName: updated.name, dueAt: (newDue as Date).toISOString() },
              });
              console.log(`[workflow-notifications] due reminder rescheduled for ${updated.id} new due ${(newDue as Date).toISOString()}`);
            }
          }
          const oldAssignee = existing.assigneeUserId ?? null;
          const newAssignee = (updated.assigneeUserId as string) ?? null;
          if (oldAssignee !== newAssignee && newAssignee) {
            try {
              const { enqueueWorkflowNotificationDb } = await import("./notifications");
              await enqueueWorkflowNotificationDb({
                type: "assignee_changed",
                deliverableId: updated.id,
                assigneeUserId: newAssignee,
                version: updated.version,
                recipientUserId: newAssignee,
                payload: { deliverableName: updated.name },
              });
            } catch {}
          }
        } catch (err) {
          console.error("[workflow-notifications] updateDeliverable enqueue failed:", (err as Error).message);
        }
      })();
      return updated;
    },

    async reorderDeliverables(command) {
      const now = new Date();
      // verify program exists
      const program = await dbPort.getProgram(command.programId);
      if (!program) throw new WorkflowRepositoryError("NOT_FOUND", "برنامه یافت نشد.");
      const events: WorkflowEventRecord[] = command.orderedIds.map((id, idx) => ({
        id: generateEntityId("WEV"),
        entityType: "workflow_deliverable",
        entityId: id,
        action: "reordered",
        before: { sortOrder: idx } as unknown as Record<string, unknown>,
        after: { sortOrder: idx } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      }));
      if (dbPort.transactReorderDeliverables) {
        return dbPort.transactReorderDeliverables(command.programId, command.orderedIds, events);
      }
      // Fallback sequential (for mocked ports without reorder)
      const deliverables = await dbPort.listDeliverablesForProgram(command.programId);
      const idsSet = new Set(deliverables.map((d) => d.id));
      if (command.orderedIds.length !== deliverables.length || !command.orderedIds.every((id) => idsSet.has(id))) {
        throw new WorkflowRepositoryError("INVALID_TRANSITION" as unknown as "NOT_FOUND", "ترتیب نامعتبر است.");
      }
      // naive sequential update - use transactUpdateDeliverable for each but not transactional in mock; still works for tests
      const results: WorkflowDeliverableRecord[] = [];
      for (let i = 0; i < command.orderedIds.length; i++) {
        const id = command.orderedIds[i];
        const existing = await dbPort.getDeliverable(id);
        if (!existing) throw new WorkflowRepositoryError("NOT_FOUND", "خروجی یافت نشد.");
        const patch: Partial<WorkflowDeliverableRecord> = { sortOrder: i, updatedAt: now };
        const ev = events[i];
        const updated = await dbPort.transactUpdateDeliverable(id, existing.version, patch, ev);
        results.push(updated);
      }
      return results.sort((a, b) => a.sortOrder - b.sortOrder);
    },

    async getDeliverable(id) {
      return dbPort.getDeliverable(id);
    },

    async getPublication(id) {
      return dbPort.getPublication(id);
    },

    async transitionDeliverable(command) {
      const now = new Date();
      const deliverable = await dbPort.getDeliverable(command.id);
      if (!deliverable) throw new WorkflowRepositoryError("NOT_FOUND", "خروجی یافت نشد.");
      const pubs = await dbPort.listPublicationsForDeliverable(command.id);
      const publicationStatuses = pubs.map((p) => p.status as PublicationStatus);
      let result: ReturnType<typeof transitionProduction>;
      try {
        result = transitionProduction({
          status: deliverable.productionStatus as ProductionStatus,
          action: command.action,
          actor: command.actor,
          reason: command.reason,
          publicationStatuses,
        });
      } catch (e) {
        // rethrow as repository error with code preserved
        if ((e as { code?: string }).code) throw e;
        throw e;
      }
      const patch: Partial<WorkflowDeliverableRecord> = {
        productionStatus: result.status as ProductionStatus,
        updatedAt: now,
      };
      if (result.status === "cancelled") patch.archivedAt = now;
      else if (result.status === "not_started" && deliverable.productionStatus === "cancelled") patch.archivedAt = null;

      const after = { ...deliverable, ...patch, version: deliverable.version + 1, updatedAt: now };
      const event: WorkflowEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "workflow_deliverable",
        entityId: command.id,
        action: command.action,
        before: { ...deliverable } as unknown as Record<string, unknown>,
        after: { ...after } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: command.reason ?? null,
        createdAt: now,
      };
      return dbPort.transactUpdateDeliverable(command.id, command.expectedVersion, patch, event);
    },

    async transitionPublication(command) {
      const now = new Date();
      const publication = await dbPort.getPublication(command.id);
      if (!publication) throw new WorkflowRepositoryError("NOT_FOUND", "انتشار یافت نشد.");
      const deliverable = await dbPort.getDeliverable(publication.deliverableId);
      if (!deliverable) throw new WorkflowRepositoryError("NOT_FOUND", "خروجی یافت نشد.");
      let result: ReturnType<typeof transitionPublication>;
      try {
        result = transitionPublication({
          status: publication.status as PublicationStatus,
          action: command.action,
          productionStatus: deliverable.productionStatus as ProductionStatus,
          actor: command.actor,
          reason: command.reason,
          automaticTargetReady: command.automaticTargetReady,
          publishedAt: command.publishedAt,
          terminalOwner: publication.terminalOwner as TerminalOwner | null,
          overrideTo: command.overrideTo,
        });
      } catch (e) {
        if ((e as { code?: string }).code) throw e;
        throw e;
      }
      const patch: Partial<WorkflowPublicationRecord> = {
        status: result.status as PublicationStatus,
        updatedBy: command.actorUserId,
        updatedAt: now,
      };
      if (result.terminalOwner !== undefined) patch.terminalOwner = result.terminalOwner;
      if (result.clearSchedule) patch.scheduledAt = null;
      if (result.clearPublishedMetadata) {
        patch.publishedAt = null;
        patch.externalId = null;
        patch.permalink = null;
      } else if (result.status === "published" && command.publishedAt) {
        const pubDate = toDate(command.publishedAt);
        if (pubDate) patch.publishedAt = pubDate;
        else patch.publishedAt = now;
      } else if (result.status === "published" && !publication.publishedAt) {
        patch.publishedAt = now;
      }
      if (result.status === "do_not_publish" && command.reason) patch.manualReason = command.reason;
      else if (result.status !== "do_not_publish" && result.terminalOwner === null) {
        // clearing manual reason when restoring? Keep existing but allow override
        // for restore we keep null? not needed
      }

      const after = { ...publication, ...patch, version: publication.version + 1, updatedAt: now };
      const event: WorkflowEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "workflow_publication",
        entityId: command.id,
        action: command.action,
        before: { ...publication } as unknown as Record<string, unknown>,
        after: { ...after } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: command.reason ?? null,
        createdAt: now,
      };
      const updated = await dbPort.transactUpdatePublication(command.id, command.expectedVersion, patch, event);
      // Enqueue failure alert when publication transitions to failed (via publish_failed or reflect)
      if (updated.status === "failed") {
        void (async () => {
          try {
            const { enqueueWorkflowNotificationDb } = await import("./notifications");
            const deliverableName = (deliverable as { name?: string }).name ?? updated.id;
            const recipients = new Set<string>();
            const assigneeId = (deliverable as { assigneeUserId?: string | null }).assigneeUserId ?? null;
            if (assigneeId) recipients.add(assigneeId as string);
            if (command.actorUserId) recipients.add(command.actorUserId);
            // Also include manager fallback via DB query if no recipients
            if (recipients.size === 0) {
              try {
                const { db } = await import("@/db");
                const { users } = await import("@/db/schema");
                const rows = await db.select().from(users).limit(50);
                for (const u of rows) {
                  const role = (u as unknown as { role?: string }).role;
                  if (role === "manager" || role === "owner") {
                    const uid = (u as unknown as { id?: string }).id;
                    if (uid) recipients.add(uid);
                    if (recipients.size >= 3) break;
                  }
                }
              } catch {}
            }
            const failureReason = (updated as { lastErrorMessage?: string | null }).lastErrorMessage ?? command.reason ?? "publish_failed";
            const platform = (updated as { platform?: string }).platform ?? "unknown";
            for (const recipient of recipients) {
              try {
                await enqueueWorkflowNotificationDb({
                  type: "failure",
                  publicationId: updated.id,
                  version: updated.version,
                  recipientUserId: recipient,
                  payload: { deliverableName: deliverableName as string, reason: failureReason as string, platform: platform as string },
                });
              } catch {}
            }
            // If still no recipient (e.g., in-memory test without DB users), enqueue generic with no recipient so delivery can fallback to manager
            if (recipients.size === 0) {
              await enqueueWorkflowNotificationDb({
                type: "failure",
                publicationId: updated.id,
                version: updated.version,
                payload: { deliverableName: deliverableName as string, reason: failureReason as string, platform: platform as string },
              });
            }
            console.log(`[workflow-notifications] failure alert enqueued for publication ${updated.id} status=failed recipients=${Array.from(recipients).join(",")}`);
            // Group audit log via TGDB
            try {
              const { appendAuditEvent } = await import("@/lib/telegram/tgdb");
              await appendAuditEvent({ action: "workflow_publish_failed", entityType: "workflow_publication", entityId: updated.id, after: { status: "failed", reason: failureReason } });
            } catch {}
          } catch (err) {
            console.error("[workflow-notifications] failure enqueue failed:", (err as Error).message);
          }
        })();
      }
      return updated;
    },

    async createTemplate(command) {
      const now = new Date();
      const id = command.id ?? generateEntityId("WTM");
      const template: WorkflowTemplateRecord = {
        id,
        name: command.name,
        description: command.description ?? null,
        active: true,
        createdBy: command.actorUserId,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      };
      const items: WorkflowTemplateItemRecord[] = (command.items ?? []).map((it, idx) => ({
        id: generateEntityId("WIB" as never),
        templateId: id,
        name: it.name,
        kind: it.kind ?? null,
        sortOrder: it.sortOrder ?? idx,
        destinations: (it.destinations ?? []) as WorkflowTemplateItemRecord["destinations"],
        dueOffsetMinutes: it.dueOffsetMinutes ?? null,
        createdAt: now,
        updatedAt: now,
      }));
      // fallback id generation for items: use WTM prefix if WIB not in ids?
      // generateEntityId will handle WTM etc but W?? we added WIB for import batches - analog for template items use WIB? Need to ensure prefix exists in ids.ts (WIB is defined)
      const event: WorkflowEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "workflow_template",
        entityId: id,
        action: "created",
        before: null,
        after: { ...template, items } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      };
      // fix item ids if generate produced wrong prefix due to WIB mapping to WIB (import batches) - keep as is but ensure valid
      // generateEntityId("WIB") works as it's in union
      return dbPort.transactCreateTemplate(template, items, event);
    },

    async instantiateTemplate(command) {
      const now = new Date();
      const template = await dbPort.getTemplate(command.templateId);
      if (!template) throw new WorkflowRepositoryError("NOT_FOUND", "الگو یافت نشد.");
      const items = await dbPort.listTemplateItems(command.templateId);
      const baseDueAt = command.baseDueAt ? toDate(command.baseDueAt as string) : null;

      const deliverables: WorkflowDeliverableRecord[] = [];
      const publications: WorkflowPublicationRecord[] = [];
      const events: WorkflowEventRecord[] = [];

      for (const item of items) {
        const deliverableId = generateEntityId("WDL");
        const deliverable: WorkflowDeliverableRecord = {
          id: deliverableId,
          programId: command.programId,
          name: item.name,
          kind: item.kind,
          sortOrder: item.sortOrder,
          productionStatus: "not_started",
          assigneeUserId: null,
          dueAt: calculateDueAt(baseDueAt, item.dueOffsetMinutes),
          notes: null,
          contentId: null,
          fileRef: null,
          archivedAt: null,
          version: 1,
          createdBy: command.actorUserId,
          createdAt: now,
          updatedAt: now,
        };
        deliverables.push(deliverable);
        events.push({
          id: generateEntityId("WEV"),
          entityType: "workflow_deliverable",
          entityId: deliverableId,
          action: "created_from_template",
          before: null,
          after: { ...deliverable } as unknown as Record<string, unknown>,
          actorUserId: command.actorUserId,
          source: "api",
          reason: null,
          createdAt: now,
        });
        for (const dest of item.destinations ?? []) {
          const pubId = generateEntityId("WPB");
          const pub: WorkflowPublicationRecord = {
            id: pubId,
            deliverableId,
            platform: dest.platform,
            socialAccountId: (dest.socialAccountId as string | null) ?? null,
            status: "waiting_for_production",
            createdSource: "manual",
            terminalOwner: null,
            scheduledAt: null,
            publishedAt: null,
            externalId: null,
            permalink: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            manualReason: null,
            version: 1,
            updatedBy: null,
            createdAt: now,
            updatedAt: now,
          };
          publications.push(pub);
          events.push({
            id: generateEntityId("WEV"),
            entityType: "workflow_publication",
            entityId: pubId,
            action: "created",
            before: null,
            after: { ...pub } as unknown as Record<string, unknown>,
            actorUserId: command.actorUserId,
            source: "api",
            reason: null,
            createdAt: now,
          });
        }
      }

      if (deliverables.length === 0) return [];

      // For template instantiation, also create a program-level event?
      // Add one more event for instantiate action
      events.push({
        id: generateEntityId("WEV"),
        entityType: "workflow_program",
        entityId: command.programId,
        action: "instantiate_template",
        before: null,
        after: { templateId: command.templateId, programId: command.programId } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      });

      return dbPort.transactInstantiateTemplate(command.programId, deliverables, publications, events);
    },

    async listHistory(filters) {
      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 20;
      if (dbPort.listEvents) {
        const { items, total } = await dbPort.listEvents({ ...filters, page, pageSize });
        return { items, total, page, pageSize };
      }
      // fallback for mocked ports without listEvents: empty
      return { items: [], total: 0, page, pageSize };
    },
  };
}

export const workflowRepository: WorkflowRepository = createWorkflowRepository();

export type { WorkflowDatabasePort as WorkflowDatabasePortType };
