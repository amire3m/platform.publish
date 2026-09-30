import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { credentials, socialAccounts, youtubeQuotaUsage } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { getGoogleOAuthClient } from "@/lib/providers/youtube";
import { google } from "googleapis";

// ---------------------------------------------------------------------------
// YouTube gateway: single door for every Data API v3 read about OUR channels.
// Reads only (writes stay in providers/youtube.ts). All calls are quota-guarded
// and cached, so "any other detail" is one function + one API resource away.
// Quota costs: list=1, insert=1600 (writes not here). Search intentionally absent.
// ---------------------------------------------------------------------------

export const YOUTUBE_QUOTA_DAILY_CAP = 8000;

export class GatewayError extends Error {
  constructor(
    public code: "NOT_FOUND" | "NO_CREDENTIAL" | "RECONNECT_REQUIRED" | "RETRYABLE" | "QUOTA_EXCEEDED" | "PERMANENT",
    message: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export interface AuthedClient {
  accountId: string;
  youtube: ReturnType<typeof google.youtube>;
}

export async function getAccountClient(accountId: string): Promise<AuthedClient> {
  const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, accountId)).limit(1);
  if (!account) throw new GatewayError("NOT_FOUND", "حساب یافت نشد.");
  if (account.platform !== "youtube") throw new GatewayError("PERMANENT", "فقط حساب یوتیوب پشتیبانی می‌شود.");
  if (!account.credentialRef) throw new GatewayError("NO_CREDENTIAL", "این حساب OAuth ندارد.");
  const [cred] = await db.select().from(credentials).where(eq(credentials.id, account.credentialRef)).limit(1);
  if (!cred) throw new GatewayError("NO_CREDENTIAL", "اعتبارنامه یافت نشد.");
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(decryptSecret(cred.encryptedPayload));
  } catch {
    throw new GatewayError("RECONNECT_REQUIRED", "اعتبارنامه خراب است؛ اتصال مجدد لازم است.");
  }
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials(payload);
  return { accountId, youtube: google.youtube({ version: "v3", auth: oauth2Client }) };
}

function tehranDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function quotaUsedToday(accountId: string): Promise<number> {
  try {
    const [row] = (await db
      .select()
      .from(youtubeQuotaUsage)
      .where(and(eq(youtubeQuotaUsage.accountId, accountId), eq(youtubeQuotaUsage.day, tehranDay() as never)))
      .limit(1)) as unknown as Array<{ units: number }>;
    return row?.units ?? 0;
  } catch {
    return 0;
  }
}

async function guardQuota(accountId: string, cost: number): Promise<void> {
  const used = await quotaUsedToday(accountId);
  if (used + cost > YOUTUBE_QUOTA_DAILY_CAP) {
    throw new GatewayError("QUOTA_EXCEEDED", `سقف کوتای امروز یوتیوب تمام شد (${used}/${YOUTUBE_QUOTA_DAILY_CAP}). فردا تلاش کنید.`);
  }
}

async function recordQuota(accountId: string, units: number): Promise<void> {
  try {
    await db
      .insert(youtubeQuotaUsage)
      .values({ accountId, day: tehranDay() as never, units, updatedAt: new Date() } as never)
      .onConflictDoUpdate({
        target: [youtubeQuotaUsage.accountId, youtubeQuotaUsage.day],
        set: { units: sql`${youtubeQuotaUsage.units} + ${units}`, updatedAt: new Date() } as never,
      });
  } catch (e) {
    console.error("[youtube-gateway] quota record failed:", (e as Error).message);
  }
}

function classifyGatewayError(e: unknown): GatewayError {
  const status = (e as { code?: number; response?: { status?: number } }).code ?? (e as { response?: { status?: number } }).response?.status ?? null;
  const msg = (e as Error).message ?? "";
  if (status === 401 || status === 403 || /invalid_grant|autherror|insufficient/i.test(msg)) {
    return new GatewayError("RECONNECT_REQUIRED", "اتصال یوتیوب قطع شده؛ از تنظیمات دوباره متصل کنید.");
  }
  if (status === 429 || (status !== null && status >= 500)) return new GatewayError("RETRYABLE", "یوتیوب موقتاً پاسخ نداد؛ بعداً تلاش کنید.");
  if (status === 404) return new GatewayError("NOT_FOUND", "در یوتیوب یافت نشد.");
  return new GatewayError("PERMANENT", "خواندن از یوتیوب ناموفق بود.");
}

// Simple in-memory cache (10 min) for cheap repeated reads
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;
  const p = fn();
  p.then((v) => cache.set(key, { at: Date.now(), value: v })).catch(() => {});
  return p;
}

async function call<T>(client: AuthedClient, cost: number, key: string | null, fn: () => Promise<T>): Promise<T> {
  await guardQuota(client.accountId, cost);
  try {
    const out = key ? await cached(key, fn) : await fn();
    await recordQuota(client.accountId, cost);
    return out;
  } catch (e) {
    if (e instanceof GatewayError) throw e;
    throw classifyGatewayError(e);
  }
}

// --- Resources ---

export interface ChannelFull {
  id: string;
  title: string;
  description: string | null;
  customUrl: string | null;
  thumbnails: Record<string, string>;
  statistics: Record<string, number | null>;
  topicCategories: string[];
  uploadsPlaylistId: string | null;
}

export async function getChannelFull(client: AuthedClient): Promise<ChannelFull> {
  return call(client, 1, `channel:${client.accountId}`, async () => {
    const res = await client.youtube.channels.list({ part: ["snippet", "statistics", "brandingSettings", "contentDetails", "topicDetails"], mine: true });
    const ch = res.data.items?.[0];
    if (!ch?.id) throw new GatewayError("NOT_FOUND", "کانال یافت نشد.");
    const stats: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(ch.statistics ?? {})) {
      stats[k] = v == null ? null : Number(v as string);
    }
    const thumbs: Record<string, string> = {};
    for (const [k, v] of Object.entries(ch.snippet?.thumbnails ?? {})) {
      const url = (v as { url?: string }).url;
      if (url) thumbs[k] = url;
    }
    return {
      id: ch.id,
      title: ch.snippet?.title ?? "",
      description: ch.snippet?.description ?? null,
      customUrl: ch.snippet?.customUrl ?? null,
      thumbnails: thumbs,
      statistics: stats,
      topicCategories: ch.topicDetails?.topicCategories ?? [],
      uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads ?? null,
    };
  });
}

export interface VideoFull {
  id: string;
  title: string;
  description: string;
  publishedAt: string | null;
  thumbnails: Record<string, string>;
  uploadStatus: string | null;
  rejectionReason: string | null;
  privacyStatus: string | null;
  license: string | null;
  embeddable: boolean | null;
  duration: string | null;
  dimension: string | null;
  definition: string | null;
  licensedContent: boolean | null;
  statistics: Record<string, number | null>;
}

export async function getVideosFull(client: AuthedClient, videoIds: string[]): Promise<VideoFull[]> {
  const out: VideoFull[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const rows = await call(client, 1, `videos:${client.accountId}:${chunk.join(",")}`, async () => {
      const res = await client.youtube.videos.list({ part: ["snippet", "status", "contentDetails", "statistics", "player"], id: chunk });
      return (res.data.items ?? []).map((v) => {
        const thumbs: Record<string, string> = {};
        for (const [k, t] of Object.entries(v.snippet?.thumbnails ?? {})) {
          const url = (t as { url?: string }).url;
          if (url) thumbs[k] = url;
        }
        const stats: Record<string, number | null> = {};
        for (const [k, val] of Object.entries(v.statistics ?? {})) {
          stats[k] = val == null ? null : Number(val as string);
        }
        return {
          id: v.id ?? "",
          title: v.snippet?.title ?? "",
          description: v.snippet?.description ?? "",
          publishedAt: v.snippet?.publishedAt ?? null,
          thumbnails: thumbs,
          uploadStatus: v.status?.uploadStatus ?? null,
          rejectionReason: v.status?.rejectionReason ?? null,
          privacyStatus: v.status?.privacyStatus ?? null,
          license: v.status?.license ?? null,
          embeddable: v.status?.embeddable ?? null,
          duration: v.contentDetails?.duration ?? null,
          dimension: v.contentDetails?.dimension ?? null,
          definition: v.contentDetails?.definition ?? null,
          licensedContent: (v.contentDetails as { licensedContent?: boolean } | undefined)?.licensedContent ?? null,
          statistics: stats,
        };
      });
    });
    out.push(...rows);
  }
  return out;
}

/** Minimal status rows for the copyright status-watch (includes missing-video detection). */
export async function getVideosStatus(
  client: AuthedClient,
  videoIds: string[],
): Promise<Array<{ videoId: string; uploadStatus: string | null; rejectionReason: string | null; privacyStatus: string | null; missing: boolean }>> {
  const out: Array<{ videoId: string; uploadStatus: string | null; rejectionReason: string | null; privacyStatus: string | null; missing: boolean }> = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const rows = await call(client, 1, `status:${client.accountId}:${chunk.join(",")}`, async () => {
      const res = await client.youtube.videos.list({ part: ["status"], id: chunk });
      return (res.data.items ?? []).map((v) => ({
        videoId: v.id ?? "",
        uploadStatus: v.status?.uploadStatus ?? null,
        rejectionReason: v.status?.rejectionReason ?? null,
        privacyStatus: v.status?.privacyStatus ?? null,
      }));
    });
    const seen = new Set(rows.map((r) => r.videoId));
    out.push(...rows.map((r) => ({ ...r, missing: false })));
    for (const id of chunk) {
      if (!seen.has(id)) out.push({ videoId: id, uploadStatus: null, rejectionReason: null, privacyStatus: null, missing: true });
    }
  }
  return out;
}

export interface UploadItem {
  videoId: string;
  title: string;
  publishedAt: string | null;
  thumbnail: string | null;
}

export async function listUploads(client: AuthedClient, pageToken?: string, maxResults = 25): Promise<{ items: UploadItem[]; nextPageToken: string | null }> {
  const channel = await getChannelFull(client);
  if (!channel.uploadsPlaylistId) throw new GatewayError("NOT_FOUND", "پلی‌لیست آپلودها یافت نشد.");
  return call(client, 1, `uploads:${client.accountId}:${pageToken ?? ""}:${maxResults}`, async () => {
    const res = await client.youtube.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId: channel.uploadsPlaylistId as string,
      maxResults: Math.min(Math.max(maxResults, 1), 50),
      pageToken,
    });
    return {
      items: (res.data.items ?? []).map((it) => ({
        videoId: it.contentDetails?.videoId ?? "",
        title: it.snippet?.title ?? "",
        publishedAt: it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt ?? null,
        thumbnail: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? null,
      })),
      nextPageToken: res.data.nextPageToken ?? null,
    };
  });
}

export interface PlaylistFull {
  id: string;
  title: string;
  description: string | null;
  itemCount: number | null;
  thumbnail: string | null;
}

export async function listPlaylistsFull(client: AuthedClient): Promise<PlaylistFull[]> {
  return call(client, 1, `playlists:${client.accountId}`, async () => {
    const res = await client.youtube.playlists.list({ part: ["snippet", "contentDetails"], mine: true, maxResults: 50 });
    return (res.data.items ?? [])
      .filter((p) => p.id)
      .map((p) => ({
        id: p.id as string,
        title: p.snippet?.title ?? "بدون عنوان",
        description: p.snippet?.description ?? null,
        itemCount: p.contentDetails?.itemCount ?? null,
        thumbnail: p.snippet?.thumbnails?.medium?.url ?? null,
      }));
  });
}

export async function getPlaylistItemsFull(client: AuthedClient, playlistId: string, pageToken?: string): Promise<{ items: UploadItem[]; nextPageToken: string | null }> {
  return call(client, 1, `plitems:${client.accountId}:${playlistId}:${pageToken ?? ""}`, async () => {
    const res = await client.youtube.playlistItems.list({ part: ["snippet", "contentDetails"], playlistId, maxResults: 50, pageToken });
    return {
      items: (res.data.items ?? []).map((it) => ({
        videoId: it.contentDetails?.videoId ?? "",
        title: it.snippet?.title ?? "",
        publishedAt: it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt ?? null,
        thumbnail: it.snippet?.thumbnails?.medium?.url ?? null,
      })),
      nextPageToken: res.data.nextPageToken ?? null,
    };
  });
}

export interface CommentItem {
  id: string;
  author: string;
  text: string;
  likes: number;
  publishedAt: string | null;
  replies: number;
}

export async function getVideoComments(client: AuthedClient, videoId: string, maxResults = 20): Promise<CommentItem[]> {
  return call(client, 1, `comments:${client.accountId}:${videoId}`, async () => {
    const res = await client.youtube.commentThreads.list({ part: ["snippet"], videoId, maxResults: Math.min(Math.max(maxResults, 1), 50), order: "relevance" });
    return (res.data.items ?? []).map((t) => {
      const top = t.snippet?.topLevelComment?.snippet;
      return {
        id: t.id ?? "",
        author: top?.authorDisplayName ?? "",
        text: top?.textDisplay ?? "",
        likes: top?.likeCount ?? 0,
        publishedAt: top?.publishedAt ?? null,
        replies: t.snippet?.totalReplyCount ?? 0,
      };
    });
  });
}

export interface CaptionItem {
  id: string;
  language: string;
  name: string;
  trackKind: string;
}

export async function listCaptions(client: AuthedClient, videoId: string): Promise<CaptionItem[]> {
  return call(client, 1, `captions:${client.accountId}:${videoId}`, async () => {
    const res = await client.youtube.captions.list({ part: ["snippet"], videoId });
    return (res.data.items ?? [])
      .filter((c) => c.id)
      .map((c) => ({
        id: c.id as string,
        language: c.snippet?.language ?? "",
        name: c.snippet?.name ?? "",
        trackKind: c.snippet?.trackKind ?? "",
      }));
  });
}
