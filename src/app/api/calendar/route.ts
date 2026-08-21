import { db } from "@/db";
import { content } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { canAccessAccount } from "@/lib/permissions";
import { isNotNull } from "drizzle-orm";

export async function GET(req: Request) {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");
  const accountId = url.searchParams.get("accountId");
  const status = url.searchParams.get("status");

  const rows = await db.select().from(content).where(isNotNull(content.scheduledAtUtc));

  const events = rows.flatMap((row) => {
    const targets = (row.platformTargets as { platform: string; account_id: string; content_type: string; status: string; publish_at_utc?: string; publish_at_jalali?: string }[]) ?? [];
    return targets
      .filter((t) => {
        if (platform && t.platform !== platform) return false;
        if (accountId && t.account_id !== accountId) return false;
        if (status && t.status !== status) return false;
        return canAccessAccount(user, t.account_id);
      })
      .map((t) => ({
        contentId: row.id,
        title: row.title || "(بدون عنوان)",
        platform: t.platform,
        accountId: t.account_id,
        contentType: t.content_type,
        status: t.status,
        publishAtUtc: t.publish_at_utc ?? row.scheduledAtUtc,
        publishAtJalali: t.publish_at_jalali ?? row.scheduledAtJalali,
        contentStatus: row.status,
        approvalStatus: row.approvalStatus,
        hasError: Boolean(row.error),
        thumbnailAvailable: (row.media as unknown[])?.length > 0,
      }));
  });

  return jsonOk(events);
}
