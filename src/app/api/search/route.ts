import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { InMemoryContentRoomPort, deriveIsCold } from "@/lib/content-room/repository";

export interface SearchResultItem {
  id: string;
  type: "content_product" | "workflow_program" | "asset";
  title: string;
  channel?: string | null;
  status?: string | null;
  tags?: string[];
  createdAt?: string | Date | null;
  archivedAt?: string | Date | null;
  isCold?: boolean;
  score?: number;
}

export async function handleSearchRequest(
  request: Request,
  deps: { requirePermission: typeof requirePermission } = { requirePermission },
): Promise<Response> {
  const permissionCheck = await deps.requirePermission("view_content_room");
  // Also allow view_workflow / view_assets / view_archive? For simplicity require view_content_room OR view_workflow
  if (!permissionCheck.user) return permissionCheck.response!;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const typeFilter = url.searchParams.get("type") ?? undefined; // content_product | workflow_program | asset
  const channel = url.searchParams.get("channel") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
  const dateTo = url.searchParams.get("dateTo") ?? undefined;
  const includeArchived = url.searchParams.get("includeArchived") === "true" || url.searchParams.get("includeArchived") === "1";
  const sort = url.searchParams.get("sort") ?? "newest"; // newest | oldest | relevance
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "50", 10) || 50, 1), 50);
  const pageParam = url.searchParams.get("page");
  const page = Math.max(parseInt(pageParam ?? "1", 10) || 1, 1);
  const fromDate = dateFrom ? new Date(dateFrom) : null;
  const toDate = dateTo ? new Date(dateTo) : null;

  const results: SearchResultItem[] = [];

  // helper to match ILIKE semantics (case-insensitive substring)
  function matches(text: string | null | undefined, query: string): boolean {
    if (!query) return true;
    if (!text) return false;
    return text.toLowerCase().includes(query.toLowerCase());
  }

  function inDateRange(d: Date | string | null | undefined): boolean {
    if (!d) return false;
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return true; // ignore invalid
    if (fromDate && !Number.isNaN(fromDate.getTime()) && date < fromDate) return false;
    if (toDate && !Number.isNaN(toDate.getTime()) && date > toDate) return false;
    return true;
  }

  // 1. content_products via drizzle or InMemory fallback
  if (!typeFilter || typeFilter === "content_product" || typeFilter === "content") {
    try {
      const { db } = await import("@/db");
      const { contentProducts } = await import("@/db/schema");
      const { sql, eq, and, isNull, gte, lte } = await import("drizzle-orm");
      const conditions: unknown[] = [];
      if (!includeArchived) conditions.push(isNull(contentProducts.archivedAt));
      if (q) {
        const term = "%" + q + "%";
        conditions.push(sql`(${contentProducts.title} ILIKE ${term} OR ${contentProducts.notes} ILIKE ${term})`);
      }
      if (channel) conditions.push(eq(contentProducts.channel, channel));
      if (status) conditions.push(eq(contentProducts.status, status));
      if (fromDate && !Number.isNaN(fromDate.getTime())) conditions.push(gte(contentProducts.createdAt, fromDate));
      if (toDate && !Number.isNaN(toDate.getTime())) conditions.push(lte(contentProducts.createdAt, toDate));
      const rows = conditions.length
        ? await db.select().from(contentProducts).where(and(...(conditions as never[]))).limit(limit * 3)
        : await db.select().from(contentProducts).limit(limit * 3);
      for (const row of rows as unknown as Array<Record<string, unknown>>) {
        const createdAt = (row.createdAt as Date) ?? (row.created_at as Date);
        const archivedAt = (row.archivedAt as Date | null) ?? (row.archived_at as Date | null) ?? null;
        // manual inDate check for fallback if sql not enough (already filtered but safe)
        if (fromDate || toDate) {
          if (!inDateRange(createdAt)) continue;
        }
        results.push({
          id: row.id as string,
          type: "content_product",
          title: row.title as string,
          channel: (row.channel as string) ?? null,
          status: (row.status as string) ?? null,
          createdAt,
          archivedAt,
          isCold: archivedAt ? deriveIsCold(archivedAt) : false,
          score: q ? (matches(row.title as string, q) ? 2 : 0) + (matches(row.notes as string, q) ? 1 : 0) : 0,
        });
      }
    } catch {
      // fallback InMemory port with memory if DB unavailable
      // we attempt to list via InMemoryContentRoomPort's seeded memory if any; otherwise skip
      try {
        const { contentRoomRepository } = await import("@/lib/content-room/repository");
        const items = await contentRoomRepository.listProducts(
          {
            search: q || undefined,
            channel,
            status,
            includeArchived,
            dateFrom: fromDate ?? undefined,
            dateTo: toDate ?? undefined,
          } as never,
        );
        for (const p of items) {
          results.push({
            id: p.id,
            type: "content_product",
            title: p.title,
            channel: p.channel,
            status: p.status,
            createdAt: p.createdAt,
            archivedAt: p.archivedAt ?? null,
            isCold: p.isCold ?? deriveIsCold(p.archivedAt ?? null),
            score: q ? (matches(p.title, q) ? 2 : 0) + (matches(p.notes ?? "", q) ? 1 : 0) : 0,
          });
        }
      } catch {
        // ignore
      }
    }
  }

  // 2. workflow_programs
  if (!typeFilter || typeFilter === "workflow_program" || typeFilter === "program") {
    try {
      const { db } = await import("@/db");
      const { workflowPrograms } = await import("@/db/schema");
      const { sql, isNull, eq, and, gte, lte } = await import("drizzle-orm");
      const conditions: unknown[] = [];
      if (!includeArchived) conditions.push(isNull(workflowPrograms.archivedAt));
      if (q) {
        const term = "%" + q + "%";
        conditions.push(sql`${workflowPrograms.title} ILIKE ${term}`);
      }
      if (fromDate && !Number.isNaN(fromDate.getTime())) conditions.push(gte(workflowPrograms.createdAt, fromDate));
      if (toDate && !Number.isNaN(toDate.getTime())) conditions.push(lte(workflowPrograms.createdAt, toDate));
      // status filter not applicable to programs, skip
      const rows = conditions.length
        ? await db.select().from(workflowPrograms).where(and(...(conditions as never[]))).limit(limit * 3)
        : await db.select().from(workflowPrograms).limit(limit * 3);
      for (const row of rows as unknown as Array<Record<string, unknown>>) {
        const createdAt = (row.createdAt as Date) ?? (row.created_at as Date);
        if (fromDate || toDate) {
          if (!inDateRange(createdAt)) continue;
        }
        results.push({
          id: row.id as string,
          type: "workflow_program",
          title: row.title as string,
          createdAt,
          archivedAt: (row.archivedAt as Date | null) ?? (row.archived_at as Date | null) ?? null,
          isCold: false,
          score: q ? (matches(row.title as string, q) ? 2 : 0) : 0,
        });
      }
    } catch {
      try {
        const { db } = await import("@/db");
        void db;
      } catch {}
      // fallback: try workflow repository if available
      try {
        const { createWorkflowRepository } = await import("@/lib/workflow/repository");
        const repo = createWorkflowRepository();
        const programs = await repo.listPrograms({ search: q || undefined, includeArchived }, {} as never);
        for (const prog of programs) {
          if (fromDate || toDate) {
            if (!inDateRange(prog.createdAt)) continue;
          }
          results.push({
            id: prog.id,
            type: "workflow_program",
            title: prog.title,
            createdAt: prog.createdAt,
            archivedAt: prog.archivedAt ?? null,
            isCold: false,
            score: q ? (matches(prog.title, q) ? 2 : 0) : 0,
          });
        }
      } catch {}
    }
  }

  // 3. assets (filename, tags) via listAssets repository (in-memory + DB parts)
  if (!typeFilter || typeFilter === "asset") {
    try {
      const { listAssets } = await import("@/lib/assets/repository");
      const assets = await listAssets({ query: q || undefined, channel: channel || undefined } as never);
      for (const a of assets) {
        const createdAt = a.createdAt ? new Date(a.createdAt) : new Date();
        if (status && status !== a.type) continue;
        if (fromDate || toDate) {
          if (!inDateRange(createdAt)) continue;
        }
        // ILIKE on filename/tags already filtered by listAssets when q provided, but we double-check score
        const score = q ? (matches(a.filename, q) ? 2 : 0) + (a.tags.some((t) => matches(t, q)) ? 1 : 0) : 0;
        if (q && score === 0) continue;
        results.push({
          id: a.id,
          type: "asset",
          title: a.filename,
          channel: a.channelId,
          status: a.type,
          tags: a.tags,
          createdAt,
          score,
        });
      }
    } catch {
      // ignore assets failure
    }
  }

  // sort
  if (sort === "oldest") {
    results.sort((a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime());
  } else if (sort === "relevance" && q) {
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
  } else {
    // newest first default
    results.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
  }

  const total = results.length;
  const offset = (page - 1) * limit;
  const paged = results.slice(offset, offset + limit);

  return jsonOk({ items: paged, total, page, pageSize: limit });
}

export async function GET(request: Request): Promise<Response> {
  const check = await requirePermission("view_content_room");
  if (!check.user) return check.response!;
  // Re-check but also allow view_archive? Already view_content_room covers it per permissions
  // Delegate to handleSearchRequest which does its own check; we avoid double-check mismatch
  // Call handleSearchRequest with a mock that returns success if we already passed
  return handleSearchRequest(request, {
    requirePermission: async () => ({ user: check.user, response: null }) as never,
  });
}
