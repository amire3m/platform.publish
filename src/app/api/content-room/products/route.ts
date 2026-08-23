import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { contentRoomRepository, type ContentRoomRepository } from "@/lib/content-room/repository";
import { createProductSchema } from "@/lib/content-room/validation";

export interface ProductsRouteDependencies {
  requirePermission: typeof requirePermission;
  repository: Pick<ContentRoomRepository, "listProducts" | "createProduct">;
}

const defaultDependencies: ProductsRouteDependencies = {
  requirePermission,
  repository: contentRoomRepository,
};

function mapRepositoryError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "خطای سرور";
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  if (code === "INVALID_TRANSITION") return jsonError(message, 422, "INVALID_TRANSITION");
  if (code === "REASON_REQUIRED") return jsonError(message, 422, "REASON_REQUIRED");
  return null;
}

export async function handleProductsRequest(
  request: Request,
  deps: ProductsRouteDependencies = defaultDependencies,
): Promise<Response> {
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const { user, response } = await deps.requirePermission("view_content_room");
    if (!user) return response!;

    try {
      const url = new URL(request.url);
      const productType = url.searchParams.get("type") ?? url.searchParams.get("productType") ?? undefined;
      const channel = url.searchParams.get("channel") ?? undefined;
      const status = url.searchParams.get("status") ?? undefined;
      const search = url.searchParams.get("query") ?? url.searchParams.get("search") ?? url.searchParams.get("q") ?? undefined;
      const includeArchived = url.searchParams.get("includeArchived") === "true" || url.searchParams.get("includeArchived") === "1";
      const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
      const dateTo = url.searchParams.get("dateTo") ?? undefined;
      const sort = url.searchParams.get("sort") ?? undefined;

      const filters: Record<string, string | boolean | undefined> = {};
      if (productType) filters.productType = productType;
      if (channel) filters.channel = channel;
      if (status) filters.status = status;
      if (search) filters.search = search;
      if (includeArchived) filters.includeArchived = true;
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      if (sort) filters.sort = sort;

      const products = await deps.repository.listProducts(
        filters as never,
        { userId: (user as unknown as { id?: string }).id ?? null },
      );
      return jsonOk(products);
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) return mapped;
      return jsonError((error as Error).message ?? "خطای سرور", 500);
    }
  }

  if (method === "POST") {
    const { user, response } = await deps.requirePermission("manage_content_room");
    if (!user) return response!;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
    }

    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "ورودی نامعتبر است.", 422, "VALIDATION_ERROR");
    }

    try {
      const data = parsed.data;
      const created = await deps.repository.createProduct({
        title: data.title,
        productType: data.productType,
        channel: data.channel,
        partsCount: data.partsCount,
        notes: data.notes ?? null,
        actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
      });
      return jsonOk(created, 201);
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) return mapped;
      return jsonError((error as Error).message ?? "خطای سرور", 500);
    }
  }

  return jsonError("روش پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");
}

export async function GET(request: Request): Promise<Response> {
  return handleProductsRequest(request, defaultDependencies);
}

export async function POST(request: Request): Promise<Response> {
  return handleProductsRequest(request, defaultDependencies);
}
