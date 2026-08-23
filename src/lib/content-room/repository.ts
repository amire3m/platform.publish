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
}

export interface ContentPartRecord {
  id: string;
  productId: string;
  partNumber: number;
  fileRef: string | null;
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
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((p) => p.title.toLowerCase().includes(q));
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
    // newest first
    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return result;
  }

  async getProduct(id: string): Promise<ContentProductRecord | null> {
    return this.productMap.get(id) ?? null;
  }

  async getProductDetail(id: string): Promise<ContentProductDetail | null> {
    const product = this.productMap.get(id) ?? null;
    if (!product) return null;
    const parts = this.partsByProduct.get(id) ?? [];
    return { ...product, parts: [...parts].sort((a, b) => a.partNumber - b.partNumber) };
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
      const { eq, and, sql } = await import("drizzle-orm");
      const conditions: unknown[] = [];
      if (filters?.search) {
        conditions.push(sql`${contentProducts.title} ILIKE ${"%" + filters.search + "%"}`);
      }
      if (filters?.productType) conditions.push(eq(contentProducts.productType, filters.productType));
      if (filters?.channel) conditions.push(eq(contentProducts.channel, filters.channel));
      if (filters?.status) conditions.push(eq(contentProducts.status, filters.status));
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
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mapProductRow(row: Record<string, unknown>): ContentProductRecord {
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
  };
}

function mapPartRow(row: Record<string, unknown>): ContentPartRecord {
  return {
    id: row.id as string,
    productId: (row.productId as string) ?? (row.product_id as string),
    partNumber: (row.partNumber as number) ?? (row.part_number as number),
    fileRef: (row.fileRef as string | null) ?? (row.file_ref as string | null) ?? null,
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
  getParts(productId: string): Promise<ContentPartRecord[]>;
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
      };
      const parts: ContentPartRecord[] = [];
      for (let i = 1; i <= command.partsCount; i++) {
        parts.push({
          id: generateEntityId("CPP"),
          productId: id,
          partNumber: i,
          fileRef: null,
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
  };
}

export const contentRoomRepository: ContentRoomRepository = createContentRoomRepository();

// alias for task spec: provide ContentRoomPort
export type ContentRoomPort = ContentRoomDatabasePort;
