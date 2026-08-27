import { google } from "googleapis";
import { db } from "@/db";
import { credentials, socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";

export interface FallbackVideo {
  accountId: string;
  channelId: string;
  channelTitle: string;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number;
}

/**
 * Fetch last videos via YouTube Data API fallback.
 * For each account, fetches channel uploads playlist via channels.list(mine:true),
 * then playlistItems for uploads, then videos.list for statistics.
 * Returns aggregated videos sorted by viewCount desc.
 */
export async function fetchLastVideos(accountIds: string[]): Promise<FallbackVideo[]> {
  const videos: FallbackVideo[] = [];

  for (const id of accountIds.slice(0, 4)) {
    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.id, id))
      .limit(1);
    if (!account?.credentialRef || !account.externalAccountId) continue;
    const [cred] = await db
      .select()
      .from(credentials)
      .where(eq(credentials.id, account.credentialRef))
      .limit(1);
    if (!cred) continue;

    try {
      const tokens = JSON.parse(decryptSecret(cred.encryptedPayload));
      const auth = getGoogleOAuthClient();
      auth.setCredentials(tokens);
      const youtube = google.youtube({ version: "v3", auth });

      // Try mine:true first; fallback to id externalAccountId if uploads missing
      let uploadsId: string | undefined;
      let channelTitleFallback = account.displayName ?? account.externalAccountId;
      try {
        const chRes = await youtube.channels.list({
          part: ["contentDetails", "snippet"],
          mine: true,
        });
        const channel = chRes.data.items?.[0];
        uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads ?? undefined;
        if (channel?.snippet?.title) channelTitleFallback = channel.snippet.title;
        // If no uploadsId and we have externalAccountId, try by channel id
        if (!uploadsId && account.externalAccountId) {
          const chById = await youtube.channels.list({
            part: ["contentDetails", "snippet"],
            id: [account.externalAccountId],
          });
          const ch2 = chById.data.items?.[0];
          uploadsId = ch2?.contentDetails?.relatedPlaylists?.uploads ?? undefined;
          if (ch2?.snippet?.title) channelTitleFallback = ch2.snippet.title;
        }
      } catch {
        // Try by id as fallback
        try {
          if (account.externalAccountId) {
            const chById = await youtube.channels.list({
              part: ["contentDetails", "snippet"],
              id: [account.externalAccountId],
            });
            const ch2 = chById.data.items?.[0];
            uploadsId = ch2?.contentDetails?.relatedPlaylists?.uploads ?? undefined;
            if (ch2?.snippet?.title) channelTitleFallback = ch2.snippet.title;
          }
        } catch {
          continue;
        }
        if (!uploadsId) continue;
      }

      if (!uploadsId) continue;

      const plRes = await youtube.playlistItems.list({
        part: ["contentDetails", "snippet"],
        playlistId: uploadsId,
        maxResults: 10,
      });
      const vIds = (plRes.data.items ?? [])
        .map((it) => it.contentDetails?.videoId)
        .filter(Boolean) as string[];
      if (vIds.length === 0) continue;

      const vRes = await youtube.videos.list({
        part: ["snippet", "statistics"],
        id: vIds,
      });

      for (const v of vRes.data.items ?? []) {
        if (!v.id) continue;
        videos.push({
          accountId: id,
          channelId: account.externalAccountId,
          channelTitle: channelTitleFallback,
          videoId: v.id,
          title: v.snippet?.title ?? "",
          thumbnailUrl:
            v.snippet?.thumbnails?.high?.url ??
            v.snippet?.thumbnails?.medium?.url ??
            v.snippet?.thumbnails?.default?.url ??
            null,
          publishedAt: v.snippet?.publishedAt ?? null,
          viewCount: Number(v.statistics?.viewCount ?? 0),
          likeCount: Number(v.statistics?.likeCount ?? 0),
        });
      }
    } catch {
      continue;
    }
  }

  return videos.sort((a, b) => b.viewCount - a.viewCount || a.videoId.localeCompare(b.videoId));
}

/**
 * Convenience wrapper that resolves main report accountIds and returns videos sorted.
 * Useful for dashboard fallback where caller doesn't have accountIds.
 */
export async function fetchTopVideosFallback(): Promise<FallbackVideo[]> {
  const { listMainReportAccountIds } = await import("@/lib/accounts/organization-server");
  const accountIds = await listMainReportAccountIds("youtube");
  if (accountIds.length === 0) return [];
  return fetchLastVideos(accountIds);
}
