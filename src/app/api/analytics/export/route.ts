import { db } from "@/db";
import { analyticsSnapshots } from "@/db/schema";
import { requirePermission } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-helpers";

export async function GET() {
  const { user, response } = await requirePermission("export_data");
  if (!user) return response;

  const rows = await db.select().from(analyticsSnapshots);
  if (rows.length === 0) {
    return jsonError("داده‌ای برای Export موجود نیست.", 404);
  }

  const header = "id,platform,accountId,dateJalali,dateUtc,followers,views,reach,likes,comments,shares,saves,engagementRate\n";
  const body = rows
    .map((r) =>
      [
        r.id,
        r.platform,
        r.accountId,
        r.dateJalali,
        r.dateUtc.toISOString(),
        r.followersOrSubscribers,
        r.views,
        r.reach,
        r.likes,
        r.comments,
        r.shares,
        r.saves,
        r.engagementRate,
      ].join(","),
    )
    .join("\n");

  return new Response(header + body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=analytics-export.csv",
    },
  });
}
