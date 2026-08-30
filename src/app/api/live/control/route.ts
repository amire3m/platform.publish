import { jsonError, jsonOk } from "@/lib/api-helpers";
import { requireLivePermission } from "@/lib/live/perm";
import { dispatchControl, type ControlRequestBody } from "@/lib/live/control";
import { getStreamer } from "@/lib/live/playlist-streamer";

export const runtime = "nodejs";

export async function GET() {
  const { response } = await requireLivePermission();
  if (response) return response;
  return jsonOk(getStreamer().toPublic());
}

export async function POST(req: Request) {
  const { response } = await requireLivePermission();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as ControlRequestBody | null;
  const result = await dispatchControl(getStreamer(), body);
  if (!result.ok) return jsonError(result.error, result.status, "LIVE_CONTROL_ERROR");
  return jsonOk(result.session);
}
