import { jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";
import { getStreamer } from "@/lib/live/playlist-streamer";

export const runtime = "nodejs";

async function requireLivePermission() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") };
  const subject = {
    role: (user as unknown as { role: string }).role,
    allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
    allowedAccountIds: (user as unknown as { allowedAccountIds?: string[] }).allowedAccountIds ?? [],
  };
  const ok = hasPermission(subject, "manage_content_room" as Permission) || hasPermission(subject, "publish_now" as Permission);
  if (!ok) return { user: null, response: jsonError("شما مجوز مدیریت لایو را ندارید.", 403, "FORBIDDEN") };
  return { user, response: null };
}

export async function GET() {
  const { response } = await requireLivePermission();
  if (response) return response;
  return jsonOk(getStreamer().toPublic());
}

export async function POST(req: Request) {
  const { response } = await requireLivePermission();
  if (response) return response;

  const body = await req.json().catch(() => null) as { action?: string } | null;
  const action = body?.action;
  if (action !== "skip" && action !== "stop") {
    return jsonError("اقدام نامعتبر است. skip یا stop بفرستید.", 400, "VALIDATION_ERROR");
  }
  const streamer = getStreamer();
  const ok = action === "skip" ? streamer.skip() : streamer.stop("manual");
  if (!ok) return jsonError("جلسه لایو فعالی برای این اقدام وجود ندارد.", 409, "NO_ACTIVE_SESSION");
  return jsonOk(streamer.toPublic());
}
