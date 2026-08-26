import { google } from "googleapis";
import { db } from "@/db";
import { credentials, socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";
import { accountScopeForUser } from "@/lib/permissions";
import { restrictAccountScopeToOrganization } from "@/lib/accounts/organization";
import { listMainReportAccountIds } from "@/lib/accounts/organization-server";

export async function GET(req: Request) {
  const { user, response } = await requirePermission("view_analytics");
  if (!user) return response!;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || undefined;
  const reportingIds = await listMainReportAccountIds();
  const allowed = restrictAccountScopeToOrganization(accountScopeForUser(user), reportingIds);
  if (accountId && !allowed.includes(accountId)) return jsonError("دسترسی ندارید.", 403);

  const targetIds = accountId ? [accountId] : allowed;
  if (targetIds.length === 0) return jsonOk({ videos: [] });

  const videos: Array<{
    accountId: string;
    channelId: string;
    channelTitle: string;
    videoId: string;
    title: string;
    thumbnailUrl: string | null;
    publishedAt: string | null;
    viewCount: number;
    likeCount: number;
  }> = [];

  for (const id of targetIds.slice(0, 4)) {
    const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
    if (!account?.credentialRef || !account.externalAccountId) continue;
    const [cred] = await db.select().from(credentials).where(eq(credentials.id, account.credentialRef)).limit(1);
    if (!cred) continue;
    try {
      const tokens = JSON.parse(decryptSecret(cred.encryptedPayload));
      const auth = getGoogleOAuthClient();
      auth.setCredentials(tokens);
      const youtube = google.youtube({ version: "v3", auth });
      const chRes = await youtube.channels.list({ part: ["contentDetails", "snippet"], mine: true });
      const channel = chRes.data.items?.[0];
      const uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsId) continue;
      const plRes = await youtube.playlistItems.list({ part: ["contentDetails", "snippet"], playlistId: uploadsId, maxResults: 20 });
      const vIds = (plRes.data.items ?? []).map((it) => it.contentDetails?.videoId).filter(Boolean) as string[];
      if (vIds.length === 0) continue;
      const vRes = await youtube.videos.list({ part: ["snippet", "statistics"], id: vIds });
      for (const v of vRes.data.items ?? []) {
        if (!v.id) continue;
        videos.push({
          accountId: id,
          channelId: account.externalAccountId,
          channelTitle: account.displayName,
          videoId: v.id,
          title: v.snippet?.title ?? "",
          thumbnailUrl: v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? null,
          publishedAt: v.snippet?.publishedAt ?? null,
          viewCount: Number(v.statistics?.viewCount ?? 0),
          likeCount: Number(v.statistics?.likeCount ?? 0),
        });
      }
    } catch {
      continue;
    }
  }

  const top = [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 10);
  const latest = [...videos].sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()).slice(0, 10);
  return jsonOk({ videos, top, latest });
}
