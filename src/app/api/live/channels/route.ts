import { eq } from "drizzle-orm";
import { db } from "@/db";
import { liveChannels } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { encryptSecret } from "@/lib/crypto";
import { generateEntityId } from "@/lib/ids";
import { buildChannelCreate, publicChannel } from "@/lib/live/shared";

export const runtime = "nodejs";

export async function GET() {
  const { response } = await requirePermission("manage_live");
  if (response) return response;
  try {
    const rows = await db.select().from(liveChannels).orderBy(liveChannels.createdAt);
    return jsonOk(rows.map(publicChannel));
  } catch (err) {
    return jsonInternalError(err, "live/channels GET");
  }
}

export async function POST(req: Request) {
  const { response } = await requirePermission("manage_live");
  if (response) return response;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = buildChannelCreate(body as never);
    if (!input) return jsonError("نام، RTMP URL و کلید استریم الزامی است.", 400, "VALIDATION_ERROR");
    const [row] = await db
      .insert(liveChannels)
      .values({
        id: generateEntityId("LCH"),
        name: input.name,
        provider: input.provider,
        rtmpUrl: input.rtmpUrl,
        streamKeyEncrypted: encryptSecret(input.streamKey),
      })
      .returning();
    return jsonOk(publicChannel(row));
  } catch (err) {
    return jsonInternalError(err, "live/channels POST");
  }
}

export async function PATCH(req: Request) {
  const { response } = await requirePermission("manage_live");
  if (response) return response;
  try {
    const body = (await req.json().catch(() => null)) as { id?: string; name?: string; rtmpUrl?: string; streamKey?: string; isActive?: boolean } | null;
    if (!body?.id) return jsonError("شناسه کانال الزامی است.", 400, "VALIDATION_ERROR");
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
    if (typeof body.rtmpUrl === "string" && body.rtmpUrl.trim()) update.rtmpUrl = body.rtmpUrl.trim();
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;
    if (typeof body.streamKey === "string" && body.streamKey.trim()) {
      update.streamKeyEncrypted = encryptSecret(body.streamKey.trim());
    }
    const [row] = await db.update(liveChannels).set(update).where(eq(liveChannels.id, body.id)).returning();
    if (!row) return jsonError("کانال پیدا نشد.", 404, "NOT_FOUND");
    return jsonOk(publicChannel(row));
  } catch (err) {
    return jsonInternalError(err, "live/channels PATCH");
  }
}

export async function DELETE(req: Request) {
  const { response } = await requirePermission("manage_live");
  if (response) return response;
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return jsonError("شناسه کانال الزامی است.", 400, "VALIDATION_ERROR");
    const [row] = await db.delete(liveChannels).where(eq(liveChannels.id, id)).returning();
    if (!row) return jsonError("کانال پیدا نشد.", 404, "NOT_FOUND");
    return jsonOk({ id });
  } catch (err) {
    return jsonInternalError(err, "live/channels DELETE");
  }
}
