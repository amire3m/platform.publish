import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser, jsonOk } from "@/lib/api-helpers";

/**
 * Lightweight id→name map of active staff for audit tooltips
 * (e.g. who checked each content-room box). Any signed-in user may read
 * names; full user management stays behind `manage_users`.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const rows = await db
    .select({ id: users.id, name: users.name, jobFunctions: users.jobFunctions })
    .from(users)
    .where(eq(users.active, true));
  return jsonOk({ names: rows });
}
