import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { loadReadinessResult, runReadinessProbe, saveReadinessResult } from "@/lib/readiness";

export async function GET(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response!;
  const data = await loadReadinessResult();
  if (!data) return jsonOk({ status: "unknown", checks: [], summary: "هنوز بررسی نشده — یک اجرای آزمایشی انجام دهید.", generatedAt: null });
  return jsonOk(data);
}

export async function POST(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("manage_content_room");
  if (!user) return response!;
  let body: unknown;
  try { body = await req.json().catch(() => ({})); } catch { body = {}; }
  const includePaidMedia = Boolean((body as Record<string, unknown>).includePaidMedia);
  // includePaidMedia is accepted but not used to trigger paid API calls — kept for parity with AgentTube
  const result = await runReadinessProbe({ includePaidMedia });
  await saveReadinessResult(result);
  return jsonOk(result);
}
