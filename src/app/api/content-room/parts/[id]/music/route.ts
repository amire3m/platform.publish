import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentPartMusic, musicLibrary } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildPlaybackUrl, isRealFileId } from "@/lib/media/playback-token";

function subjectOf(user: unknown): { role: string; allowedActions: string[] } {
  return {
    role: (user as { role: string }).role,
    allowedActions: (user as { allowedActions?: string[] }).allowedActions ?? [],
  };
}

function canEdit(user: unknown): boolean {
  const s = subjectOf(user);
  return hasPermission(s, "manage_content_room") || hasPermission(s, "update_assigned_content");
}

function canView(user: unknown): boolean {
  const s = subjectOf(user);
  return canEdit(user) || hasPermission(s, "view_content_room");
}

/** Musics linked to one part. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  if (!canView(user)) return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  const { id: partId } = await ctx.params;
  try {
    const links = await db.select().from(contentPartMusic).where(eq(contentPartMusic.partId, partId));
    if (!links.length) return jsonOk({ items: [] });
    const ids = links.map((l) => l.musicId);
    const { inArray } = await import("drizzle-orm");
    const rows = (await db.select().from(musicLibrary).where(inArray(musicLibrary.id, ids))) as unknown as Array<{
      id: string;
      title: string;
      fileRef: string;
      fileName: string | null;
      telegramLink: string | null;
    }>;
    return jsonOk({
      items: rows.map((r) => ({
        ...r,
        playbackUrl: isRealFileId(r.fileRef) ? buildPlaybackUrl(r.fileRef, "audio/mpeg") : null,
      })),
    });
  } catch (error) {
    return jsonInternalError(error, "api/content-room/parts music GET");
  }
}

/** Link an existing library music to this part (no re-upload). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  if (!canEdit(user)) return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  const { id: partId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { musicId?: string } | null;
  if (!body?.musicId) return jsonError("شناسه موسیقی الزامی است.", 422, "VALIDATION_ERROR");
  try {
    const [music] = await db.select().from(musicLibrary).where(eq(musicLibrary.id, body.musicId)).limit(1);
    if (!music) return jsonError("موسیقی یافت نشد.", 404, "NOT_FOUND");
    await db
      .insert(contentPartMusic)
      .values({ partId, musicId: body.musicId } as never)
      .onConflictDoNothing();
    return jsonOk({ linked: true });
  } catch (error) {
    return jsonInternalError(error, "api/content-room/parts music POST");
  }
}

/** Unlink a music from this part (library entry stays). */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  if (!canEdit(user)) return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  const { id: partId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { musicId?: string } | null;
  if (!body?.musicId) return jsonError("شناسه موسیقی الزامی است.", 422, "VALIDATION_ERROR");
  try {
    await db
      .delete(contentPartMusic)
      .where(and(eq(contentPartMusic.partId, partId), eq(contentPartMusic.musicId, body.musicId)));
    return jsonOk({ unlinked: true });
  } catch (error) {
    return jsonInternalError(error, "api/content-room/parts music DELETE");
  }
}
