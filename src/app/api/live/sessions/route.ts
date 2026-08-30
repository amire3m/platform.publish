import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { liveSessions, liveSessionItems } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { requireLivePermission } from "@/lib/live/perm";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { response } = await requireLivePermission();
  if (response) return response;
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id) {
      const [session] = await db.select().from(liveSessions).where(eq(liveSessions.id, id)).limit(1);
      if (!session) return jsonError("نشست پیدا نشد.", 404, "NOT_FOUND");
      const items = await db.select().from(liveSessionItems).where(eq(liveSessionItems.sessionRef, id)).orderBy(liveSessionItems.position);
      return jsonOk({ session, items });
    }
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const rows = await db.select().from(liveSessions).orderBy(desc(liveSessions.startedAt)).limit(limit);
    return jsonOk(rows);
  } catch (err) {
    return jsonInternalError(err, "live/sessions GET");
  }
}
