import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { activateStrategy, getStrategy, listRuns, runOperatorNow, upsertStrategy } from "@/lib/operator";

export async function GET(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response!;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  if (scope === "runs") {
    const runs = await listRuns();
    return jsonOk({ runs });
  }
  const strategy = await getStrategy();
  return jsonOk({ strategy });
}

export async function POST(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("manage_content_room");
  if (!user) return response!;
  let body: unknown;
  try { body = await req.json(); } catch { return jsonError("درخواست نامعتبر است.", 400); }
  const b = body as Record<string, unknown>;
  const action = String(b.action ?? "");
  if (action === "save-strategy") {
    const objective = String(b.objective ?? "").trim();
    const audience = String(b.audience ?? "").trim();
    const pillars = Array.isArray(b.pillars) ? (b.pillars as string[]).map((s) => String(s).trim()).filter(Boolean) : [];
    if (!objective || !audience || !pillars.length) return jsonError("هدف، مخاطب و حداقل یک محور الزامی است.", 400);
    const strategy = await upsertStrategy({
      objective, audience, pillars,
      cadencePerWeek: b.cadencePerWeek != null ? Number(b.cadencePerWeek) : 2,
      videosPerRun: b.videosPerRun != null ? Number(b.videosPerRun) : 2,
      defaultFormat: b.defaultFormat ? String(b.defaultFormat) : "tutorial",
      defaultLength: b.defaultLength ? String(b.defaultLength) : "medium",
      primaryKpi: b.primaryKpi ? String(b.primaryKpi) : "views",
      targetValue: b.targetValue != null ? Number(b.targetValue) : null,
      targetWindowDays: b.targetWindowDays != null ? Number(b.targetWindowDays) : 28,
      monthlyBudget: b.monthlyBudget != null ? Number(b.monthlyBudget) : null,
      currency: b.currency ? String(b.currency) : "USD",
      guardrails: (b.guardrails ?? {}) as Record<string, unknown>,
    });
    return jsonOk({ strategy });
  }
  if (action === "activate") {
    const s = await activateStrategy();
    if (!s) return jsonError("استراتژی یافت نشد.", 404);
    return jsonOk({ strategy: s });
  }
  if (action === "run-now") {
    const res = await runOperatorNow();
    return jsonOk(res);
  }
  return jsonError("action نامعتبر است.", 400);
}
