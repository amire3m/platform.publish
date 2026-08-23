import { generateEntityId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------
export const CONTENT_STATUSES = [
  "imported",
  "editing_youtube",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
  "ready_to_send",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const PRODUCT_TYPES = [
  "serial",
  "documentary",
  "tv_program",
  "film",
  "short_film",
  "educational",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const CHANNELS = [
  "zed_revayat",
  "zaviye_no",
  "tamashin",
  "iranian_frame",
  "shock",
  "tinazh",
] as const;
export type Channel = (typeof CHANNELS)[number];

const STATUS_ORDER: Record<ContentStatus, number> = {
  imported: 0,
  editing_youtube: 1,
  copyright_fix: 2,
  highlight_done: 3,
  reel_done: 4,
  cover_ready: 5,
  ready_to_send: 6,
};

export function deriveIsCold(archivedAt: Date | null | undefined): boolean {
  if (!archivedAt) return false;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return archivedAt.getTime() < cutoff;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class ContentRoomRepositoryError extends Error {
  constructor(
    public code: "VERSION_CONFLICT" | "NOT_FOUND" | "INVALID_TRANSITION" | "REASON_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "ContentRoomRepositoryError";
  }
}

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------
export interface ContentProductRecord {
  id: string;
  title: string;
  productType: ProductType;
  channel: Channel;
  partsCount: number;
  status: ContentStatus;
  version: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  dueAt: Date | null;
  notes: string | null;
  archivedAt: Date | null;
  isCold?: boolean;
}

export interface ContentPartRecord {
  id: string;
  productId: string;
  partNumber: number;
  fileRef: string | null;
  coverFileRef: string | null;
  version: number;
  status: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentProductDetail extends ContentProductRecord {
  parts: ContentPartRecord[];
}

export interface ProductFilters {
  search?: string;
  productType?: string;
  channel?: string;
  status?: string;
  includeArchived?: boolean;
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
  sort?: string;
}

export interface ProductScope {
  userId?: string | null;
}

// Commands
export interface CreateProductCommand {
  id?: string;
  title: string;
  productType: ProductType | string;
  channel: Channel | string;
  partsCount: number;
  notes?: string | null;
  dueAt?: string | Date | null;
  actorUserId: string;
}

export interface UpdateProductStatusCommand {
  id: string;
  status: ContentStatus | string;
  expectedVersion: number;
  actorUserId: string;
  reason?: string | null;
}

export interface ContentRoomEventRecord {
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

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------
export interface ContentRoomDatabasePort {
  listProducts(filters?: ProductFilters, scope?: ProductScope): Promise<ContentProductRecord[]>;
  getProduct(id: string): Promise<ContentProductRecord | null>;
  getProductDetail?(id: string): Promise<ContentProductDetail | null>;
  listPartsForProduct(productId: string): Promise<ContentPartRecord[]>;
  transactCreateProduct(
    product: ContentProductRecord,
    parts: ContentPartRecord[],
    event: ContentRoomEventRecord,
  ): Promise<ContentProductRecord>;
  transactUpdateProduct(
    id: string,
    expectedVersion: number,
    patch: Partial<ContentProductRecord>,
    event: ContentRoomEventRecord,
  ): Promise<ContentProductRecord>;
  transactArchiveProduct?(
    id: string,
    archivedAt: Date | null,
    event: ContentRoomEventRecord,
  ): Promise<ContentProductRecord>;
  getPart?(id: string): Promise<ContentPartRecord | null>;
  transactUpdatePartFile?(
    partId: string,
    expectedVersion: number | null,
    patch: Partial<Pick<ContentPartRecord, "fileRef" | "coverFileRef">>,
    event: ContentRoomEventRecord,
  ): Promise<ContentPartRecord>;
}

// ---------------------------------------------------------------------------
// In-Memory port
// ---------------------------------------------------------------------------
export class InMemoryContentRoomPort implements ContentRoomDatabasePort {
  products: ContentProductRecord[] = [];
  parts: ContentPartRecord[] = [];
  events: ContentRoomEventRecord[] = [];

  private productMap = new Map<string, ContentProductRecord>();
  private partsByProduct = new Map<string, ContentPartRecord[]>();

  async listProducts(filters?: ProductFilters): Promise<ContentProductRecord[]> {
    let result = [...this.products];
    // default exclude archived
    if (!filters?.includeArchived) {
      result = result.filter((p) => !p.archivedAt);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      // search title and notes
      result = result.filter((p) => p.title.toLowerCase().includes(q) || (p.notes ?? "").toLowerCase().includes(q));
    }
    if (filters?.productType) {
      result = result.filter((p) => p.productType === filters.productType);
    }
    if (filters?.channel) {
      result = result.filter((p) => p.channel === filters.channel);
    }
    if (filters?.status) {
      result = result.filter((p) => p.status === filters.status);
    }
    if (filters?.dateFrom) {
      const from = new Date(filters.dateFrom as string);
      if (!Number.isNaN(from.getTime())) result = result.filter((p) => p.createdAt >= from);
    }
    if (filters?.dateTo) {
      const to = new Date(filters.dateTo as string);
      if (!Number.isNaN(to.getTime())) result = result.filter((p) => p.createdAt <= to);
    }
    // attach isCold
    result = result.map((p) => ({ ...p, isCold: deriveIsCold(p.archivedAt) }));
    // sorting: support sort param; default newest first
    if (filters?.sort === "oldest") {
      result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    } else {
      result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return result;
  }

  async getProduct(id: string): Promise<ContentProductRecord | null> {
    const p = this.productMap.get(id) ?? null;
    if (!p) return null;
    return { ...p, isCold: deriveIsCold(p.archivedAt) };
  }

  async getProductDetail(id: string): Promise<ContentProductDetail | null> {
    const product = this.productMap.get(id) ?? null;
    if (!product) return null;
    const parts = this.partsByProduct.get(id) ?? [];
    return { ...product, isCold: deriveIsCold(product.archivedAt), parts: [...parts].sort((a, b) => a.partNumber - b.partNumber) };
  }

  async listPartsForProduct(productId: string): Promise<ContentPartRecord[]> {
    const arr = this.partsByProduct.get(productId) ?? [];
    return [...arr].sort((a, b) => a.partNumber - b.partNumber);
  }

  async transactCreateProduct(
    product: ContentProductRecord,
    parts: ContentPartRecord[],
    event: ContentRoomEventRecord,
  ): Promise<ContentProductRecord> {
    this.productMap.set(product.id, product);
    this.products.push(product);
    const list = [...parts];
    this.partsByProduct.set(product.id, list);
    for (const p of parts) this.parts.push(p);
    this.events.push(event);
    return product;
  }

  async transactUpdateProduct(
    id: string,
    expectedVersion: number,
    patch: Partial<ContentProductRecord>,
    event: ContentRoomEventRecord,
  ): Promise<ContentProductRecord> {
    const existing = this.productMap.get(id);
    if (!existing) throw new ContentRoomRepositoryError("NOT_FOUND", "محصول یافت نشد.");
    if (existing.version !== expectedVersion)
      throw new ContentRoomRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
    const updated: ContentProductRecord = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: (patch.updatedAt as Date) ?? new Date(),
    };
    this.productMap.set(id, updated);
    const idx = this.products.findIndex((p) => p.id === id);
    if (idx >= 0) this.products[idx] = updated;
    this.events.push(event);
    event.after = { ...updated } as unknown as Record<string, unknown>;
    return { ...updated, isCold: deriveIsCold(updated.archivedAt) };
  }

  async transactArchiveProduct(id: string, archivedAt: Date | null, event: ContentRoomEventRecord): Promise<ContentProductRecord> {
    const existing = this.productMap.get(id);
    if (!existing) throw new ContentRoomRepositoryError("NOT_FOUND", "محصول یافت نشد.");
    const now = new Date();
    const updated: ContentProductRecord = {
      ...existing,
      archivedAt,
      isCold: deriveIsCold(archivedAt),
      version: existing.version + 1,
      updatedAt: now,
    };
    this.productMap.set(id, updated);
    const idx = this.products.findIndex((p) => p.id === id);
    if (idx >= 0) this.products[idx] = updated;
    this.events.push(event);
    event.after = { ...updated } as unknown as Record<string, unknown>;
    return updated;
  }

  async getPart(id: string): Promise<ContentPartRecord | null> {
    return this.parts.find((p) => p.id === id) ?? null;
  }

  async transactUpdatePartFile(
    partId: string,
    expectedVersion: number | null,
    patch: Partial<Pick<ContentPartRecord, "fileRef" | "coverFileRef">>,
    event: ContentRoomEventRecord,
  ): Promise<ContentPartRecord> {
    const idx = this.parts.findIndex((p) => p.id === partId);
    if (idx < 0) throw new ContentRoomRepositoryError("NOT_FOUND", "قسمت یافت نشد.");
    const existing = this.parts[idx];
    if (expectedVersion !== null && existing.version !== expectedVersion) {
      throw new ContentRoomRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
    }
    const updated: ContentPartRecord = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: new Date(),
    };
    this.parts[idx] = updated;
    // update by product map
    const list = this.partsByProduct.get(existing.productId);
    if (list) {
      const li = list.findIndex((p) => p.id === partId);
      if (li >= 0) list[li] = updated;
    }
    this.events.push(event);
    return updated;
  }
}

// ---------------------------------------------------------------------------
// Drizzle port
// ---------------------------------------------------------------------------
function createDrizzleContentRoomPort(): ContentRoomDatabasePort {
  const getDb = async () => {
    const { db } = await import("@/db");
    return db;
  };

  return {
    async listProducts(filters) {
      const db = await getDb();
      const { contentProducts } = await import("@/db/schema");
      const { eq, and, sql, isNull, gte, lte } = await import("drizzle-orm");
      const conditions: unknown[] = [];
      if (!filters?.includeArchived) {
        conditions.push(isNull(contentProducts.archivedAt));
      }
      if (filters?.search) {
        const term = "%" + filters.search + "%";
        conditions.push(sql`(${contentProducts.title} ILIKE ${term} OR ${contentProducts.notes} ILIKE ${term})`);
      }
      if (filters?.productType) conditions.push(eq(contentProducts.productType, filters.productType));
      if (filters?.channel) conditions.push(eq(contentProducts.channel, filters.channel));
      if (filters?.status) conditions.push(eq(contentProducts.status, filters.status));
      if (filters?.dateFrom) {
        const d = new Date(filters.dateFrom as string);
        if (!Number.isNaN(d.getTime())) conditions.push(gte(contentProducts.createdAt, d));
      }
      if (filters?.dateTo) {
        const d = new Date(filters.dateTo as string);
        if (!Number.isNaN(d.getTime())) conditions.push(lte(contentProducts.createdAt, d));
      }
      const rows = conditions.length
        ? await db
            .select()
            .from(contentProducts)
            .where(and(...(conditions as never[])))
        : await db.select().from(contentProducts);
      return rows.map(mapProductRow);
    },

    async getProduct(id) {
      const db = await getDb();
      const { contentProducts } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(contentProducts).where(eq(contentProducts.id, id)).limit(1);
      return row ? mapProductRow(row as unknown as Record<string, unknown>) : null;
    },

    async getProductDetail(id) {
      const db = await getDb();
      const { contentProducts, contentParts } = await import("@/db/schema");
      const { eq, asc } = await import("drizzle-orm");
      const [productRow] = await db.select().from(contentProducts).where(eq(contentProducts.id, id)).limit(1);
      if (!productRow) return null;
      const partRows = await db
        .select()
        .from(contentParts)
        .where(eq(contentParts.productId, id))
        .orderBy(asc(contentParts.partNumber));
      const product = mapProductRow(productRow as unknown as Record<string, unknown>);
      const parts = partRows.map(mapPartRow);
      return { ...product, parts };
    },

    async listPartsForProduct(productId) {
      const db = await getDb();
      const { contentParts } = await import("@/db/schema");
      const { eq, asc } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(contentParts)
        .where(eq(contentParts.productId, productId))
        .orderBy(asc(contentParts.partNumber));
      return rows.map(mapPartRow);
    },

    async transactCreateProduct(product, parts, event) {
      const db = await getDb();
      const { contentProducts, contentParts, workflowEvents } = await import("@/db/schema");
      return db.transaction(async (tx) => {
        const [inserted] = await tx.insert(contentProducts).values(toProductInsert(product) as never).returning();
        if (!inserted) throw new ContentRoomRepositoryError("NOT_FOUND", "خطا در ایجاد محصول.");
        if (parts.length) await tx.insert(contentParts).values(parts.map(toPartInsert) as never);
        await tx.insert(workflowEvents).values(toEventInsert(event) as never);
        return mapProductRow(inserted as unknown as Record<string, unknown>);
      });
    },

    async transactUpdateProduct(id, expectedVersion, patch, event) {
      const db = await getDb();
      const { contentProducts, workflowEvents } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      return db.transaction(async (tx) => {
        const setPatch: Record<string, unknown> = {};
        if (patch.title !== undefined) setPatch.title = patch.title;
        if (patch.productType !== undefined) setPatch.productType = patch.productType;
        if (patch.channel !== undefined) setPatch.channel = patch.channel;
        if (patch.partsCount !== undefined) setPatch.partsCount = patch.partsCount;
        if (patch.status !== undefined) setPatch.status = patch.status;
        if (patch.notes !== undefined) setPatch.notes = patch.notes;
        if (patch.dueAt !== undefined) setPatch.dueAt = patch.dueAt;
        setPatch.version = expectedVersion + 1;
        setPatch.updatedAt = patch.updatedAt ?? new Date();

        // drizzle columns are snake_case via mapping? Insert helper uses camelCase; for update we need camelCase keys matching schema object properties?
        // The schema uses productType etc as JS keys but DB maps to product_type. Drizzle handles via column name mapping, so using camelCase key is correct (e.g., productType)
        // However for safety we map via helper
        const drizzlePatch = toProductPatch(patch, expectedVersion);

        const [updated] = await tx
          .update(contentProducts)
          .set(drizzlePatch as never)
          .where(and(eq(contentProducts.id, id), eq(contentProducts.version, expectedVersion)))
          .returning();
        if (updated) {
          await tx.insert(workflowEvents).values(toEventInsert(event) as never);
          return mapProductRow(updated as unknown as Record<string, unknown>);
        }
        const [existing] = await tx
          .select({ id: contentProducts.id })
          .from(contentProducts)
          .where(eq(contentProducts.id, id))
          .limit(1);
        if (!existing) throw new ContentRoomRepositoryError("NOT_FOUND", "محصول یافت نشد.");
        throw new ContentRoomRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
      });
    },

    async getPart(id) {
      const db = await getDb();
      const { contentParts } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(contentParts).where(eq(contentParts.id, id)).limit(1);
      return row ? mapPartRow(row as unknown as Record<string, unknown>) : null;
    },

    async transactArchiveProduct(id, archivedAt, event) {
      const db = await getDb();
      const { contentProducts, workflowEvents } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      return db.transaction(async (tx) => {
        const [existingRow] = await tx.select().from(contentProducts).where(eq(contentProducts.id, id)).limit(1);
        if (!existingRow) throw new ContentRoomRepositoryError("NOT_FOUND", "محصول یافت نشد.");
        const existing = existingRow as unknown as { version: number };
        const [updated] = await tx
          .update(contentProducts)
          .set({ archivedAt, updatedAt: new Date(), version: existing.version + 1 } as never)
          .where(eq(contentProducts.id, id))
          .returning();
        if (!updated) throw new ContentRoomRepositoryError("NOT_FOUND", "محصول یافت نشد.");
        await tx.insert(workflowEvents).values(toEventInsert(event) as never);
        return mapProductRow(updated as unknown as Record<string, unknown>);
      });
    },

    async transactUpdatePartFile(partId, expectedVersion, patch, event) {
      const db = await getDb();
      const { contentParts, workflowEvents } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      return db.transaction(async (tx) => {
        const setPatch: Record<string, unknown> = {};
        if (patch.fileRef !== undefined) setPatch.fileRef = patch.fileRef;
        if (patch.coverFileRef !== undefined) setPatch.coverFileRef = patch.coverFileRef;
        setPatch.updatedAt = new Date();
        // version handling
        if (expectedVersion !== null) {
          setPatch.version = expectedVersion + 1;
          const [updated] = await tx
            .update(contentParts)
            .set(setPatch as never)
            .where(and(eq(contentParts.id, partId), eq(contentParts.version, expectedVersion)))
            .returning();
          if (updated) {
            await tx.insert(workflowEvents).values(toEventInsert(event) as never);
            return mapPartRow(updated as unknown as Record<string, unknown>);
          }
          const [existing] = await tx.select({ id: contentParts.id }).from(contentParts).where(eq(contentParts.id, partId)).limit(1);
          if (!existing) throw new ContentRoomRepositoryError("NOT_FOUND", "قسمت یافت نشد.");
          throw new ContentRoomRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
        } else {
          // no version check, just update and bump
          const [existingRow] = await tx.select().from(contentParts).where(eq(contentParts.id, partId)).limit(1);
          if (!existingRow) throw new ContentRoomRepositoryError("NOT_FOUND", "قسمت یافت نشد.");
          const currentVersion = (existingRow as unknown as { version: number }).version ?? 1;
          setPatch.version = currentVersion + 1;
          const [updated] = await tx.update(contentParts).set(setPatch as never).where(eq(contentParts.id, partId)).returning();
          if (!updated) throw new ContentRoomRepositoryError("NOT_FOUND", "قسمت یافت نشد.");
          await tx.insert(workflowEvents).values(toEventInsert(event) as never);
          return mapPartRow(updated as unknown as Record<string, unknown>);
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mapProductRow(row: Record<string, unknown>): ContentProductRecord {
  const archivedAt = (row.archivedAt as Date | null) ?? (row.archived_at as Date | null) ?? null;
  return {
    id: row.id as string,
    title: row.title as string,
    productType: ((row.productType as string) ?? (row.product_type as string)) as ProductType,
    channel: ((row.channel as string) ?? (row.channel as string)) as Channel,
    partsCount: (row.partsCount as number) ?? (row.parts_count as number),
    status: ((row.status as string) ?? "imported") as ContentStatus,
    version: row.version as number,
    createdBy: (row.createdBy as string | null) ?? (row.created_by as string | null) ?? null,
    createdAt: (row.createdAt as Date) ?? (row.created_at as Date),
    updatedAt: (row.updatedAt as Date) ?? (row.updated_at as Date),
    dueAt: (row.dueAt as Date | null) ?? (row.due_at as Date | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    archivedAt,
    isCold: deriveIsCold(archivedAt),
  };
}

function mapPartRow(row: Record<string, unknown>): ContentPartRecord {
  return {
    id: row.id as string,
    productId: (row.productId as string) ?? (row.product_id as string),
    partNumber: (row.partNumber as number) ?? (row.part_number as number),
    fileRef: (row.fileRef as string | null) ?? (row.file_ref as string | null) ?? null,
    coverFileRef: (row.coverFileRef as string | null) ?? (row.cover_file_ref as string | null) ?? null,
    version: (row.version as number) ?? 1,
    status: (row.status as string | null) ?? null,
    createdAt: (row.createdAt as Date) ?? (row.created_at as Date),
    updatedAt: (row.updatedAt as Date) ?? (row.updated_at as Date),
  };
}

function toProductInsert(p: ContentProductRecord): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    productType: p.productType,
    channel: p.channel,
    partsCount: p.partsCount,
    status: p.status,
    version: p.version,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    dueAt: p.dueAt,
    notes: p.notes,
    archivedAt: p.archivedAt ?? null,
  };
}

function toProductPatch(patch: Partial<ContentProductRecord>, expectedVersion: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.productType !== undefined) out.productType = patch.productType;
  if (patch.channel !== undefined) out.channel = patch.channel;
  if (patch.partsCount !== undefined) out.partsCount = patch.partsCount;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.dueAt !== undefined) out.dueAt = patch.dueAt;
  if (patch.archivedAt !== undefined) out.archivedAt = patch.archivedAt;
  out.version = expectedVersion + 1;
  out.updatedAt = patch.updatedAt ?? new Date();
  return out;
}

function toPartInsert(p: ContentPartRecord): Record<string, unknown> {
  return {
    id: p.id,
    productId: p.productId,
    partNumber: p.partNumber,
    fileRef: p.fileRef,
    coverFileRef: p.coverFileRef,
    version: p.version,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toEventInsert(e: ContentRoomEventRecord): Record<string, unknown> {
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

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function validateStatusTransition(from: string, to: string, reason?: string | null): void {
  if (!CONTENT_STATUSES.includes(from as ContentStatus) || !CONTENT_STATUSES.includes(to as ContentStatus)) {
    throw new ContentRoomRepositoryError("INVALID_TRANSITION", `وضعیت نامعتبر: ${from} -> ${to}`);
  }
  if (from === to) {
    throw new ContentRoomRepositoryError("INVALID_TRANSITION", "وضعیت تکراری است.");
  }
  const fromIdx = STATUS_ORDER[from as ContentStatus];
  const toIdx = STATUS_ORDER[to as ContentStatus];
  const isForwardSequential = toIdx === fromIdx + 1;
  if (isForwardSequential) {
    return; // no reason required
  }
  // backward or skip requires reason
  if (!reason || reason.trim().length === 0) {
    throw new ContentRoomRepositoryError("REASON_REQUIRED", "برای این تغییر وضعیت دلیل لازم است.");
  }
}

// ---------------------------------------------------------------------------
// Repository factory
// ---------------------------------------------------------------------------
export interface ContentRoomRepository {
  listProducts(filters?: ProductFilters, scope?: ProductScope): Promise<ContentProductRecord[]>;
  getProduct(id: string): Promise<ContentProductDetail | null>;
  createProduct(command: CreateProductCommand): Promise<ContentProductDetail>;
  updateProductStatus(command: UpdateProductStatusCommand): Promise<ContentProductRecord>;
  archiveProduct(command: { id: string; actorUserId: string }): Promise<ContentProductRecord>;
  unarchiveProduct(command: { id: string; actorUserId: string }): Promise<ContentProductRecord>;
  getParts(productId: string): Promise<ContentPartRecord[]>;
  getPart?(id: string): Promise<ContentPartRecord | null>;
  updatePartFile?(command: { partId: string; fileRef?: string | null; coverFileRef?: string | null; expectedVersion?: number | null; actorUserId: string }): Promise<ContentPartRecord>;
}

export function createContentRoomRepository(port?: ContentRoomDatabasePort): ContentRoomRepository {
  const dbPort: ContentRoomDatabasePort = port ?? createDrizzleContentRoomPort();

  return {
    async listProducts(filters, scope) {
      return dbPort.listProducts(filters, scope);
    },

    async getProduct(id) {
      if (dbPort.getProductDetail) return dbPort.getProductDetail(id);
      const product = await dbPort.getProduct(id);
      if (!product) return null;
      const parts = await dbPort.listPartsForProduct(id);
      return { ...product, parts };
    },

    async getParts(productId) {
      return dbPort.listPartsForProduct(productId);
    },

    async createProduct(command) {
      // validation
      const title = command.title?.trim();
      if (!title || title.length === 0 || title.length > 200) {
        throw new ContentRoomRepositoryError("INVALID_TRANSITION", "عنوان باید ۱ تا ۲۰۰ کاراکتر باشد.");
      }
      if (!PRODUCT_TYPES.includes(command.productType as ProductType)) {
        throw new ContentRoomRepositoryError("INVALID_TRANSITION", `نوع محصول نامعتبر: ${command.productType}`);
      }
      if (!CHANNELS.includes(command.channel as Channel)) {
        throw new ContentRoomRepositoryError("INVALID_TRANSITION", `کانال نامعتبر: ${command.channel}`);
      }
      if (!Number.isInteger(command.partsCount) || command.partsCount <= 0) {
        throw new ContentRoomRepositoryError("INVALID_TRANSITION", "تعداد قسمت باید عدد مثبت باشد.");
      }
      const now = new Date();
      const id = command.id ?? generateEntityId("CPR");
      const product: ContentProductRecord = {
        id,
        title,
        productType: command.productType as ProductType,
        channel: command.channel as Channel,
        partsCount: command.partsCount,
        status: "imported",
        version: 1,
        createdBy: command.actorUserId,
        createdAt: now,
        updatedAt: now,
        dueAt: toDate(command.dueAt),
        notes: command.notes ?? null,
        archivedAt: null,
        isCold: false,
      };
      const parts: ContentPartRecord[] = [];
      for (let i = 1; i <= command.partsCount; i++) {
        parts.push({
          id: generateEntityId("CPP"),
          productId: id,
          partNumber: i,
          fileRef: null,
          coverFileRef: null,
          version: 1,
          status: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      const event: ContentRoomEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "content_product",
        entityId: id,
        action: "created",
        before: null,
        after: { ...product } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      };
      await dbPort.transactCreateProduct(product, parts, event);
      return { ...product, parts };
    },

    async updateProductStatus(command) {
      const existing = await dbPort.getProduct(command.id);
      if (!existing) throw new ContentRoomRepositoryError("NOT_FOUND", "محصول یافت نشد.");
      validateStatusTransition(existing.status, command.status, command.reason);
      const now = new Date();
      const patch: Partial<ContentProductRecord> = {
        status: command.status as ContentStatus,
        updatedAt: now,
      };
      const after = { ...existing, ...patch, version: existing.version + 1, updatedAt: now };
      const event: ContentRoomEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "content_product",
        entityId: command.id,
        action: "status_changed",
        before: { ...existing } as unknown as Record<string, unknown>,
        after: { ...after } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: command.reason ?? null,
        createdAt: now,
      };
      return dbPort.transactUpdateProduct(command.id, command.expectedVersion, patch, event);
    },

    async archiveProduct(command) {
      const existing = await dbPort.getProduct(command.id);
      if (!existing) throw new ContentRoomRepositoryError("NOT_FOUND", "محصول یافت نشد.");
      if (existing.archivedAt) throw new ContentRoomRepositoryError("INVALID_TRANSITION", "محصول قبلا آرشیو شده است.");
      const now = new Date();
      const event: ContentRoomEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "content_product",
        entityId: command.id,
        action: "archived",
        before: { ...existing } as unknown as Record<string, unknown>,
        after: { ...existing, archivedAt: now, version: existing.version + 1, updatedAt: now } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      };
      if (dbPort.transactArchiveProduct) {
        return dbPort.transactArchiveProduct(command.id, now, event);
      }
      // fallback via transactUpdateProduct
      return dbPort.transactUpdateProduct(command.id, existing.version, { archivedAt: now, updatedAt: now } as unknown as Partial<ContentProductRecord>, event);
    },

    async unarchiveProduct(command) {
      const existing = await dbPort.getProduct(command.id);
      if (!existing) throw new ContentRoomRepositoryError("NOT_FOUND", "محصول یافت نشد.");
      if (!existing.archivedAt) throw new ContentRoomRepositoryError("INVALID_TRANSITION", "محصول آرشیو نیست.");
      const now = new Date();
      const event: ContentRoomEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "content_product",
        entityId: command.id,
        action: "unarchived",
        before: { ...existing } as unknown as Record<string, unknown>,
        after: { ...existing, archivedAt: null, version: existing.version + 1, updatedAt: now } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      };
      if (dbPort.transactArchiveProduct) {
        return dbPort.transactArchiveProduct(command.id, null, event);
      }
      return dbPort.transactUpdateProduct(command.id, existing.version, { archivedAt: null, updatedAt: now } as unknown as Partial<ContentProductRecord>, event);
    },

    async getPart(id) {
      if (dbPort.getPart) return dbPort.getPart(id);
      // fallback search via list
      const allProducts = await dbPort.listProducts({ includeArchived: true } as never);
      for (const p of allProducts) {
        const parts = await dbPort.listPartsForProduct(p.id);
        const found = parts.find((x) => x.id === id);
        if (found) return found;
      }
      return null;
    },

    async updatePartFile(command) {
      const expectedVersion = command.expectedVersion ?? null;
      const patch: Partial<Pick<ContentPartRecord, "fileRef" | "coverFileRef">> = {};
      if (command.fileRef !== undefined) patch.fileRef = command.fileRef;
      if (command.coverFileRef !== undefined) patch.coverFileRef = command.coverFileRef;
      if (!dbPort.transactUpdatePartFile) throw new ContentRoomRepositoryError("NOT_FOUND", "ذخیره فایل پشتیبانی نمی‌شود.");
      // fetch existing for before snapshot
      const existing = dbPort.getPart ? await dbPort.getPart(command.partId) : null;
      const now = new Date();
      const after = existing ? { ...existing, ...patch, version: (existing.version ?? 1) + 1, updatedAt: now } : patch;
      const event: ContentRoomEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "content_part",
        entityId: command.partId,
        action: "file_updated",
        before: (existing as unknown as Record<string, unknown>) ?? null,
        after: after as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      };
      return dbPort.transactUpdatePartFile(command.partId, expectedVersion, patch, event);
    },
  };
}

export const contentRoomRepository: ContentRoomRepository = createContentRoomRepository();

// alias for task spec: provide ContentRoomPort
export type ContentRoomPort = ContentRoomDatabasePort;
