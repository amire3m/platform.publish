import { db } from "@/db";
import { content } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { canAccessAccount } from "@/lib/permissions";
import { desc } from "drizzle-orm";

export async function GET(req: Request) {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const platform = url.searchParams.get("platform");
  const accountId = url.searchParams.get("accountId");
  const search = url.searchParams.get("q")?.toLowerCase();

  const rows = await db.select().from(content).orderBy(desc(content.createdAt)).limit(500);

  const filtered = rows.filter((row) => {
    if (status && row.status !== status) return false;
    const targets = (row.platformTargets as { platform: string; account_id: string }[]) ?? [];
    if (platform && !targets.some((t) => t.platform === platform)) return false;
    if (accountId && !targets.some((t) => t.account_id === accountId)) return false;
    if (!targets.some((t) => canAccessAccount(user, t.account_id)) && targets.length > 0) return false;
    if (search && !`${row.title} ${row.description} ${row.caption}`.toLowerCase().includes(search)) return false;
    return true;
  });

  return jsonOk(filtered);
}
