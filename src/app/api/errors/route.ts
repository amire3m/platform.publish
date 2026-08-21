import { db } from "@/db";
import { content } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { desc, or, eq, isNotNull } from "drizzle-orm";

export async function GET() {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;

  const rows = await db
    .select()
    .from(content)
    .where(or(eq(content.status, "failed"), isNotNull(content.error)))
    .orderBy(desc(content.updatedAt))
    .limit(200);

  return jsonOk(rows);
}
