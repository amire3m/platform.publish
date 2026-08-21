import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSnapshots, content } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";

export async function GET(_req: Request, { params }: { params: Promise<{ scope: string; id: string }> }) {
  const { user, response } = await requirePermission("view_analytics");
  if (!user) return response;
  const { scope, id } = await params;

  if (scope === "account") {
    const rows = await db
      .select()
      .from(analyticsSnapshots)
      .where(eq(analyticsSnapshots.accountId, id))
      .orderBy(desc(analyticsSnapshots.dateUtc))
      .limit(90);
    return jsonOk(rows);
  }

  if (scope === "content") {
    const [row] = await db.select().from(content).where(eq(content.id, id)).limit(1);
    if (!row) return jsonError("محتوا یافت نشد.", 404);
    return jsonOk({ publishResults: row.publishResults, platformTargets: row.platformTargets });
  }

  return jsonError("scope نامعتبر است.", 400);
}
