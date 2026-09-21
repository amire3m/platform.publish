import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { buildRadarHealth } from "@/lib/radar/health";
import { getLatestRadar, runRadarOnce } from "@/lib/radar/run";

export async function GET(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response!;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "health";
  if (scope === "health") {
    const data = await buildRadarHealth();
    return jsonOk(data);
  }
  if (scope === "latest") {
    const data = await getLatestRadar();
    return jsonOk(data);
  }
  return jsonError("scope نامعتبر است.", 400);
}

export async function POST(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("manage_content_room");
  if (!user) return response!;
  let body: unknown;
  try { body = await req.json().catch(() => ({})); } catch { body = {}; }
  const action = (body as Record<string, unknown>).action as string;
  if (action !== "run") return jsonError("action باید run باشد.", 400);
  const result = await runRadarOnce();
  return jsonOk(result);
}
