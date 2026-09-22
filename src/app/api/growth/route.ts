import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { buildOutcomeProgress, createExperiment, evaluateExperiment, getOutcome, listExperiments, recordArmMetrics, saveOutcome, startExperiment } from "@/lib/growth";
import { growthExperimentArms } from "@/db/schema";
import { db } from "@/db";
import { eq } from "drizzle-orm";

export async function GET(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response!;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  if (scope === "outcome") {
    const data = await buildOutcomeProgress();
    return jsonOk(data);
  }
  if (scope === "experiments") {
    const contentId = url.searchParams.get("contentId") ?? undefined;
    const list = await listExperiments(contentId);
    return jsonOk({ experiments: list });
  }
  if (scope === "arms") {
    const expId = url.searchParams.get("experimentId");
    if (!expId) return jsonError("experimentId الزامی است.", 400);
    const arms = (await db.select().from(growthExperimentArms).where(eq(growthExperimentArms.experimentId, expId))) as unknown as Array<typeof growthExperimentArms.$inferSelect>;
    return jsonOk({ arms });
  }
  return jsonError("scope نامعتبر است.", 400);
}

export async function POST(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("manage_content_room");
  if (!user) return response!;
  let body: unknown;
  try { body = await req.json(); } catch { return jsonError("درخواست نامعتبر است.", 400); }
  const b = body as Record<string, unknown>;
  const action = String(b.action ?? "");
  if (action === "create-experiment") {
    const contentId = String(b.contentId ?? "");
    const variants = (b.variants ?? []) as Array<{ title: string; thumbnailUrl?: string }>;
    if (!contentId) return jsonError("contentId الزامی است.", 400);
    const id = await createExperiment(contentId, variants);
    return jsonOk({ id });
  }
  if (action === "start-experiment") {
    const id = String(b.experimentId ?? "");
    if (!id) return jsonError("experimentId الزامی است.", 400);
    await startExperiment(id);
    return jsonOk({ ok: true });
  }
  if (action === "record-metrics") {
    const armId = String(b.armId ?? "");
    const impressions = Number(b.impressions ?? 0);
    const clicks = Number(b.clicks ?? 0);
    if (!armId) return jsonError("armId الزامی است.", 400);
    await recordArmMetrics(armId, impressions, clicks);
    return jsonOk({ ok: true });
  }
  if (action === "evaluate") {
    const id = String(b.experimentId ?? "");
    if (!id) return jsonError("experimentId الزامی است.", 400);
    const res = await evaluateExperiment(id);
    return jsonOk(res);
  }
  if (action === "save-outcome") {
    const res = await saveOutcome({
      primaryKpi: b.primaryKpi ? String(b.primaryKpi) : undefined,
      targetValue: b.targetValue != null ? Number(b.targetValue) : null,
      targetWindowDays: b.targetWindowDays != null ? Number(b.targetWindowDays) : undefined,
      monthlyBudget: b.monthlyBudget != null ? Number(b.monthlyBudget) : null,
      currency: b.currency ? String(b.currency) : undefined,
    });
    return jsonOk(res);
  }
  return jsonError("action نامعتبر است.", 400);
}
