import { eq } from "drizzle-orm";
import { db } from "@/db";
import { liveChannels, liveSchedules } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { generateEntityId } from "@/lib/ids";
import { requireLivePermission } from "@/lib/live/perm";
import { validateScheduleInput, type ScheduleInput } from "@/lib/live/shared";

export const runtime = "nodejs";

export async function GET() {
  const { response } = await requireLivePermission();
  if (response) return response;
  try {
    const rows = await db
      .select({
        id: liveSchedules.id,
        name: liveSchedules.name,
        channelRef: liveSchedules.channelRef,
        channelName: liveChannels.name,
        playlistInput: liveSchedules.playlistInput,
        quality: liveSchedules.quality,
        loop: liveSchedules.loop,
        overlayEnabled: liveSchedules.overlayEnabled,
        startTehran: liveSchedules.startTehran,
        endTehran: liveSchedules.endTehran,
        daysOfWeek: liveSchedules.daysOfWeek,
        enabled: liveSchedules.enabled,
        lastStartedAt: liveSchedules.lastStartedAt,
        lastError: liveSchedules.lastError,
      })
      .from(liveSchedules)
      .leftJoin(liveChannels, eq(liveSchedules.channelRef, liveChannels.id))
      .orderBy(liveSchedules.startTehran);
    return jsonOk(rows);
  } catch (err) {
    return jsonInternalError(err, "live/schedules GET");
  }
}

export async function POST(req: Request) {
  const { response } = await requireLivePermission();
  if (response) return response;
  try {
    const body = (await req.json().catch(() => null)) as ScheduleInput | null;
    const parsed = validateScheduleInput(body);
    if (!parsed.ok) return jsonError(parsed.error, 422, "VALIDATION_ERROR");
    const v = parsed.value;
    const [channel] = await db.select().from(liveChannels).where(eq(liveChannels.id, v.channelRef)).limit(1);
    if (!channel) return jsonError("کانال انتخاب‌شده پیدا نشد.", 422, "VALIDATION_ERROR");
    const [row] = await db
      .insert(liveSchedules)
      .values({ id: generateEntityId("LSC"), ...v })
      .returning();
    return jsonOk(row);
  } catch (err) {
    return jsonInternalError(err, "live/schedules POST");
  }
}

export async function PATCH(req: Request) {
  const { response } = await requireLivePermission();
  if (response) return response;
  try {
    const body = (await req.json().catch(() => null)) as (ScheduleInput & { id?: string }) | null;
    if (!body?.id) return jsonError("شناسه برنامه الزامی است.", 400, "VALIDATION_ERROR");
    const parsed = validateScheduleInput(body);
    if (!parsed.ok) return jsonError(parsed.error, 422, "VALIDATION_ERROR");
    const [row] = await db
      .update(liveSchedules)
      .set({ ...parsed.value, updatedAt: new Date() })
      .where(eq(liveSchedules.id, body.id))
      .returning();
    if (!row) return jsonError("برنامه پیدا نشد.", 404, "NOT_FOUND");
    return jsonOk(row);
  } catch (err) {
    return jsonInternalError(err, "live/schedules PATCH");
  }
}

export async function DELETE(req: Request) {
  const { response } = await requireLivePermission();
  if (response) return response;
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return jsonError("شناسه برنامه الزامی است.", 400, "VALIDATION_ERROR");
    const [row] = await db.delete(liveSchedules).where(eq(liveSchedules.id, id)).returning();
    if (!row) return jsonError("برنامه پیدا نشد.", 404, "NOT_FOUND");
    return jsonOk({ id });
  } catch (err) {
    return jsonInternalError(err, "live/schedules DELETE");
  }
}
