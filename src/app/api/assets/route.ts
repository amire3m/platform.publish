import { jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { listAssets } from "@/lib/assets/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requirePermission("view_assets");
  if (!user) return response!;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;
  const channel = url.searchParams.get("channel") ?? undefined;
  const tag = url.searchParams.get("tag") ?? undefined;

  try {
    const assets = await listAssets({
      query: q,
      type: type || undefined,
      channel: channel || undefined,
      tag: tag || undefined,
    });
    return jsonOk(assets);
  } catch (err) {
    return jsonInternalError(err, "api/assets");
  }
}
