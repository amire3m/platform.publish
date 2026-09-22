import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { generateDraftReplies, listEngagement, syncEngagementComments } from "@/lib/engagement";
import { mapRetentionToScenes, snapshotRetention } from "@/lib/retention";

export async function GET(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response!;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  if (scope === "retention") {
    const videoId = url.searchParams.get("videoId");
    if (!videoId) return jsonError("videoId الزامی است.", 400);
    const scenes = await mapRetentionToScenes(videoId);
    return jsonOk({ scenes });
  }
  const data = await listEngagement();
  return jsonOk(data);
}

export async function POST(req: Request): Promise<Response> {
  const { user, response } = await requirePermission("manage_content_room");
  if (!user) return response!;
  let body: unknown;
  try { body = await req.json(); } catch { return jsonError("درخواست نامعتبر است.", 400); }
  const b = body as Record<string, unknown>;
  const action = String(b.action ?? "");
  if (action === "sync-comments") {
    const n = await syncEngagementComments(b.videoId ? String(b.videoId) : undefined);
    return jsonOk({ synced: n });
  }
  if (action === "draft-replies") {
    const n = await generateDraftReplies();
    return jsonOk({ drafts: n });
  }
  if (action === "snapshot-retention") {
    const videoId = String(b.videoId ?? "");
    if (!videoId) return jsonError("videoId الزامی است.", 400);
    const res = await snapshotRetention(videoId, (b.kind as string) === "short" ? "short" : "long");
    return jsonOk(res);
  }
  if (action === "map-retention") {
    const videoId = String(b.videoId ?? "");
    if (!videoId) return jsonError("videoId الزامی است.", 400);
    const scenes = await mapRetentionToScenes(videoId);
    return jsonOk({ scenes });
  }
  return jsonError("action نامعتبر است.", 400);
}
