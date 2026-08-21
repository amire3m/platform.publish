import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";

export async function GET() {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;
  const rows = await db.select().from(socialAccounts).orderBy(socialAccounts.createdAt);
  return jsonOk(rows);
}
