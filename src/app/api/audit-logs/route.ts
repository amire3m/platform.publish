import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";

export async function GET() {
  const { user, response } = await requirePermission("manage_settings");
  if (!user) return response;
  const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(300);
  return jsonOk(rows);
}
