import { google } from "googleapis";
import { db } from "@/db";
import { credentials, socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonOk, requireUser } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";
import { resolveChannelAccountIdDb } from "@/lib/channel-accounts";
import { BOARD_CHANNELS } from "@/lib/board/channels";
import { matchBoardChannel, programForPlaylists } from "@/lib/board/live-programs";
import type { BoardChannelId, CsvRow, LiveChannelMeta } from "@/lib/board/types";

const UPLOADS_CAP = 50;
const PROGRAM_PLAYLIST_CAP = 6;
const PROGRAM_ITEMS_CAP = 50;

interface Authed {
  youtube: ReturnType<typeof google.youtube>;
  analytics: ReturnType<typeof google.youtubeAnalytics>;
}

async function authedClients(accountId: string): Promise<Authed | null> {
  try {
    const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, accountId)).limit(1);
    if (!account?.credentialRef) return null;
    const [cred] = await db.select().from(credentials).where(eq(credentials.id, account.credentialRef)).limit(1);
    if (!cred) return null;
    const tokens = JSON.parse(decryptSecret(cred.encryptedPayload));
    const auth = getGoogleOAuthClient();
    auth.setCredentials(tokens);
    return {
      youtube: google.youtube({ version: "v3", auth }),
      analytics: google.youtubeAnalytics({ version: "v2", auth }),
    };
  } catch {
    return null;
  }
}

async function resolveAccountId(boardId: BoardChannelId): Promise<string | null> {
  try {
    const linked = await resolveChannelAccountIdDb(boardId, "youtube");
    if (linked) return linked;
  } catch {
    // fall through to name matching
  }
  try {
    const channels = BOARD_CHANNELS.map((c) => ({ id: c.id, nameFa: c.nameFa }));
    const accounts = await db.select().from(socialAccounts);
    for (const a of accounts) {
      const row = a as unknown as { id: string; platform?: string; displayName?: string | null };
      if (row.platform !== "youtube") continue;
      if (matchBoardChannel(row.displayName ?? "", channels) === boardId) return row.id;
    }
  } catch {
    // no match
  }
  return null;
}

function num(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchChannel(
  boardId: BoardChannelId,
  nameFa: string,
): Promise<{ rows: CsvRow[]; meta: LiveChannelMeta } | null> {
  try {
    const accountId = await resolveAccountId(boardId);
    if (!accountId) return null;
    const clients = await authedClients(accountId);
    if (!clients) return null;
    const { youtube, analytics } = clients;

    // 1) Channel totals.
    const chRes = await youtube.channels.list({ part: ["snippet", "statistics", "contentDetails"], mine: true });
    const ch = chRes.data.items?.[0];
    if (!ch) return null;
    const stats = ch.statistics ?? {};
    const subs = num(stats.subscriberCount);
    const totalViews = num(stats.viewCount);
    const videoCount = num(stats.videoCount);
    const uploadsId = ch.contentDetails?.relatedPlaylists?.uploads ?? null;

    // 2) 12-month monetization window via Analytics API (never throws the channel out).
    let subs12mo: number | null = null;
    let watchHours12mo: number | null = null;
    let views12mo: number | null = null;
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const aRes = await analytics.reports.query({
        ids: "channel==MINE",
        startDate: start,
        endDate: end,
        metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost",
      });
      const vals = aRes.data.rows?.[0];
      if (vals) {
        views12mo = Number(vals[0] ?? 0);
        watchHours12mo = Math.round(Number(vals[1] ?? 0) / 60);
        subs12mo = Number(vals[2] ?? 0) - Number(vals[3] ?? 0);
      }
    } catch {
      // analytics unavailable → nulls (shown as missing, honestly)
    }

    // 3) Playlists for program attribution (curated first, then largest).
    const videoPrograms = new Map<string, string>();
    try {
      const plRes = await youtube.playlists.list({ part: ["snippet", "contentDetails"], mine: true, maxResults: 50 });
      const lists = (plRes.data.items ?? [])
        .map((p) => ({ id: p.id as string, title: p.snippet?.title ?? "", count: p.contentDetails?.itemCount ?? 0 }))
        .filter((p) => p.id && p.count > 0);
      const curated = lists.filter((p) => /فرات|قابل توجه|مشاور|پرونده اجتماعی/.test(p.title));
      const rest = lists
        .filter((p) => !curated.includes(p))
        .sort((a, b) => b.count - a.count)
        .slice(0, Math.max(0, PROGRAM_PLAYLIST_CAP - curated.length));
      for (const pl of [...curated, ...rest].slice(0, PROGRAM_PLAYLIST_CAP)) {
        try {
          const itRes = await youtube.playlistItems.list({
            part: ["contentDetails", "snippet"],
            playlistId: pl.id,
            maxResults: PROGRAM_ITEMS_CAP,
          });
          for (const it of itRes.data.items ?? []) {
            const vid = it.contentDetails?.videoId;
            if (!vid || videoPrograms.has(vid)) continue;
            videoPrograms.set(vid, programForPlaylists([pl.title]));
          }
        } catch {
          // skip this playlist
        }
      }
    } catch {
      // no program attribution
    }

    // 4) Latest uploads + per-video stats.
    const rows: CsvRow[] = [];
    if (uploadsId) {
      const upRes = await youtube.playlistItems.list({
        part: ["contentDetails", "snippet"],
        playlistId: uploadsId,
        maxResults: UPLOADS_CAP,
      });
      const items = (upRes.data.items ?? []).filter((it) => it.contentDetails?.videoId);
      const ids = items.map((it) => it.contentDetails!.videoId as string);
      const statsById = new Map<string, { views: number; likes: number; comments: number }>();
      for (let i = 0; i < ids.length; i += 50) {
        try {
          const vRes = await youtube.videos.list({ part: ["snippet", "statistics"], id: ids.slice(i, i + 50) });
          for (const v of vRes.data.items ?? []) {
            if (!v.id) continue;
            statsById.set(v.id, {
              views: Number(v.statistics?.viewCount ?? 0),
              likes: Number(v.statistics?.likeCount ?? 0),
              comments: Number(v.statistics?.commentCount ?? 0),
            });
          }
        } catch {
          // keep zeros
        }
      }
      for (const it of items) {
        const vid = it.contentDetails!.videoId as string;
        const s = statsById.get(vid) ?? { views: 0, likes: 0, comments: 0 };
        rows.push({
          channel: nameFa,
          date: (it.snippet?.publishedAt ?? "").slice(0, 10),
          videoTitle: it.snippet?.title ?? vid,
          program: videoPrograms.get(vid) ?? "سایر",
          contentType: "ویدیو",
          views: s.views,
          watchMinutes: 0,
          avgViewSeconds: null,
          impressions: null,
          ctr: null,
          likes: s.likes,
          comments: s.comments,
          shares: 0,
          subsGained: 0,
          subsLost: 0,
          subsTotal: null,
          monetized: "",
          country: "",
          trafficSource: "",
        });
      }
    }

    return {
      rows,
      meta: { id: boardId, subs, views: totalViews, videos: videoCount, subs12mo, watchHours12mo, views12mo },
    };
  } catch {
    return null;
  }
}

/** Real per-channel YouTube data (videos, stats, 12-month monetization window) for the board report. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const results = await Promise.all(BOARD_CHANNELS.map((c) => fetchChannel(c.id, c.nameFa)));
  const rows: CsvRow[] = [];
  const channels: LiveChannelMeta[] = [];
  for (const r of results) {
    if (!r) continue;
    rows.push(...r.rows);
    channels.push(r.meta);
  }
  return jsonOk({ rows, meta: { fetchedAt: new Date().toISOString(), channels } });
}
