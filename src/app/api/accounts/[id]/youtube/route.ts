import { z } from "zod";
import { firstZodIssueMessage, jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { canAccessAccount } from "@/lib/permissions";
import {
  GatewayError,
  getAccountClient,
  getChannelFull,
  getPlaylistItemsFull,
  getVideoComments,
  getVideosFull,
  listCaptions,
  listPlaylistsFull,
  listUploads,
  quotaUsedToday,
  YOUTUBE_QUOTA_DAILY_CAP,
} from "@/lib/youtube/gateway";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  resource: z.enum(["channel", "video", "videos", "uploads", "playlists", "playlistItems", "comments", "captions"]),
  id: z.string().max(500).optional(),
  pageToken: z.string().max(200).optional(),
  maxResults: z.coerce.number().int().min(1).max(50).optional(),
});

// GET /api/accounts/:id/youtube?resource=channel|video|videos|uploads|playlists|playlistItems|comments|captions&id=&pageToken=
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;
  if (!canAccessAccount(user, id)) {
    return jsonError("شما به این حساب دسترسی ندارید.", 403, "FORBIDDEN");
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    resource: url.searchParams.get("resource"),
    id: url.searchParams.get("id") ?? undefined,
    pageToken: url.searchParams.get("pageToken") ?? undefined,
    maxResults: url.searchParams.get("maxResults") ?? undefined,
  });
  if (!parsed.success) return jsonError(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
  const q = parsed.data;

  try {
    const client = await getAccountClient(id);
    let result: unknown;
    switch (q.resource) {
      case "channel":
        result = await getChannelFull(client);
        break;
      case "video":
      case "videos": {
        if (!q.id) return jsonError("شناسه ویدیو لازم است.", 422, "VALIDATION_ERROR");
        const ids = q.id.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
        const videos = await getVideosFull(client, ids);
        result = q.resource === "video" ? (videos[0] ?? null) : videos;
        break;
      }
      case "uploads":
        result = await listUploads(client, q.pageToken, q.maxResults ?? 25);
        break;
      case "playlists":
        result = await listPlaylistsFull(client);
        break;
      case "playlistItems": {
        if (!q.id) return jsonError("شناسه پلی‌لیست لازم است.", 422, "VALIDATION_ERROR");
        result = await getPlaylistItemsFull(client, q.id, q.pageToken);
        break;
      }
      case "comments": {
        if (!q.id) return jsonError("شناسه ویدیو لازم است.", 422, "VALIDATION_ERROR");
        result = await getVideoComments(client, q.id, q.maxResults ?? 20);
        break;
      }
      case "captions": {
        if (!q.id) return jsonError("شناسه ویدیو لازم است.", 422, "VALIDATION_ERROR");
        result = await listCaptions(client, q.id);
        break;
      }
    }
    const quota = { usedToday: await quotaUsedToday(id), dailyCap: YOUTUBE_QUOTA_DAILY_CAP };
    return jsonOk({ result, quota });
  } catch (e) {
    if (e instanceof GatewayError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "QUOTA_EXCEEDED" ? 429 : e.code === "RECONNECT_REQUIRED" ? 401 : 502;
      return jsonError(e.message, status, e.code);
    }
    return jsonInternalError(e, "api/accounts/[id]/youtube");
  }
}
