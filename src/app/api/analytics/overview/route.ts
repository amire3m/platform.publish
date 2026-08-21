import { db } from "@/db";
import { content, socialAccounts, analyticsSnapshots } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { getSyncStatus } from "@/lib/telegram/tgdb";
import { desc } from "drizzle-orm";

export async function GET() {
  const { user, response } = await requirePermission("view_analytics");
  if (!user) return response;

  const accounts = await db.select().from(socialAccounts);
  const contents = await db.select().from(content);
  const recentSnapshots = await db.select().from(analyticsSnapshots).orderBy(desc(analyticsSnapshots.dateUtc)).limit(200);

  const youtubeAccounts = accounts.filter((a) => a.platform === "youtube");
  const instagramAccounts = accounts.filter((a) => a.platform === "instagram");

  const latestByAccount = new Map<string, (typeof recentSnapshots)[number]>();
  for (const snap of recentSnapshots) {
    if (!latestByAccount.has(snap.accountId)) latestByAccount.set(snap.accountId, snap);
  }

  const totalFollowers = Array.from(latestByAccount.values()).reduce(
    (sum, s) => sum + Number(s.followersOrSubscribers ?? 0),
    0,
  );
  const totalViews = recentSnapshots.reduce((sum, s) => sum + Number(s.views ?? 0), 0);
  const totalEngagement = recentSnapshots.reduce(
    (sum, s) => sum + Number(s.likes ?? 0) + Number(s.comments ?? 0) + Number(s.shares ?? 0) + Number(s.saves ?? 0),
    0,
  );

  const statusCounts = contents.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const failedContents = contents.filter((c) => c.status === "failed").slice(0, 10);
  const pendingApproval = contents.filter((c) => c.status === "in_review").slice(0, 10);
  const upcoming = contents
    .filter((c) => c.status === "scheduled")
    .sort((a, b) => (a.scheduledAtUtc?.getTime() ?? 0) - (b.scheduledAtUtc?.getTime() ?? 0))
    .slice(0, 10);

  return jsonOk({
    syncStatus: await getSyncStatus(),
    totals: {
      channels: youtubeAccounts.length,
      pages: instagramAccounts.length,
      followers: totalFollowers,
      views: totalViews,
      engagement: totalEngagement,
    },
    statusCounts,
    failedContents,
    pendingApproval,
    upcoming,
    hasAnalyticsData: recentSnapshots.length > 0,
  });
}
