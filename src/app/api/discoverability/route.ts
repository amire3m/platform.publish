import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { dismissFinding, getDiscoverabilityHistory, runDiscoverabilityAudit } from "@/lib/discoverability";
import { createShortsDrafts, listShortsDrafts, renderShortDraft } from "@/lib/shorts";

export async function GET(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response!;
  const url = new URL(req.url);
  const contentId = url.searchParams.get("contentId");
  const scope = url.searchParams.get("scope");
  if (scope === "shorts" && contentId) {
    const drafts = await listShortsDrafts(contentId);
    return jsonOk({ drafts });
  }
  if (!contentId) return jsonError("contentId الزامی است.", 400);
  const history = await getDiscoverabilityHistory(contentId);
  return jsonOk({ history });
}

export async function POST(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("manage_content_room");
  if (!user) return response!;
  let body: unknown;
  try { body = await req.json(); } catch { return jsonError("درخواست نامعتبر است.", 400); }
  const b = body as Record<string, unknown>;
  const action = String(b.action ?? "");
  if (action === "audit") {
    const contentId = String(b.contentId ?? "");
    if (!contentId) return jsonError("contentId الزامی است.", 400);
    const result = await runDiscoverabilityAudit(contentId);
    return jsonOk(result);
  }
  if (action === "dismiss") {
    const findingId = String(b.findingId ?? "");
    const reason = String(b.reason ?? "");
    if (!findingId || reason.trim().length < 5) return jsonError("دلیل رد کردن باید حداقل ۵ کاراکتر باشد.", 400);
    await dismissFinding(findingId, reason);
    return jsonOk({ ok: true });
  }
  if (action === "create-shorts") {
    const contentId = String(b.contentId ?? "");
    if (!contentId) return jsonError("contentId الزامی است.", 400);
    const drafts = await createShortsDrafts(contentId);
    return jsonOk({ drafts });
  }
  if (action === "render-short") {
    const draftId = String(b.draftId ?? "");
    if (!draftId) return jsonError("draftId الزامی است.", 400);
    const result = await renderShortDraft(draftId);
    return jsonOk(result);
  }
  return jsonError("action نامعتبر است.", 400);
}
