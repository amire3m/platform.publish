import type { ChannelConfig } from "./channels";

/**
 * Server-only channel linkage overrides (DB-backed, static config fallback).
 * channels.ts stays client-safe; this module does lazy DB imports so it can
 * be used from routes/services without polluting the client bundle.
 */

export interface ChannelAccountOverride {
  channelId: string;
  youtubeAccountId: string | null;
  instagramAccountId: string | null;
  telegramTopicId: string | null;
}

export function mergeChannelOverrides(
  staticChannels: readonly ChannelConfig[],
  overrides: Record<string, ChannelAccountOverride>,
): Array<ChannelConfig & { linked: { youtube: boolean; instagram: boolean; telegram: boolean } }> {
  return staticChannels.map((c) => {
    const o = overrides[c.id];
    const merged: ChannelConfig = o
      ? {
          ...c,
          youtubeAccountId: o.youtubeAccountId,
          instagramAccountId: o.instagramAccountId,
          telegramTopicId: o.telegramTopicId,
        }
      : c;
    return {
      ...merged,
      linked: {
        youtube: Boolean(merged.youtubeAccountId),
        instagram: Boolean(merged.instagramAccountId),
        telegram: Boolean(merged.telegramTopicId),
      },
    };
  });
}

function mapRow(r: Record<string, unknown>): ChannelAccountOverride {
  return {
    channelId: String(r.channelId ?? r.channel_id ?? ""),
    youtubeAccountId: ((r.youtubeAccountId as string | null) ?? (r.youtube_account_id as string | null) ?? null) as string | null,
    instagramAccountId: ((r.instagramAccountId as string | null) ?? (r.instagram_account_id as string | null) ?? null) as string | null,
    telegramTopicId: ((r.telegramTopicId as string | null) ?? (r.telegram_topic_id as string | null) ?? null) as string | null,
  };
}

export async function readChannelOverrides(): Promise<Record<string, ChannelAccountOverride>> {
  try {
    const { db } = await import("@/db");
    const { channelAccounts } = await import("@/db/schema");
    const rows = (await db.select().from(channelAccounts)) as unknown as Array<Record<string, unknown>>;
    const out: Record<string, ChannelAccountOverride> = {};
    for (const r of rows) {
      const mapped = mapRow(r);
      if (mapped.channelId) out[mapped.channelId] = mapped;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveChannelOverride(
  channelId: string,
  patch: { youtubeAccountId?: string | null; instagramAccountId?: string | null; telegramTopicId?: string | null },
  actorUserId: string | null,
): Promise<ChannelAccountOverride> {
  const { db } = await import("@/db");
  const { channelAccounts } = await import("@/db/schema");
  const now = new Date();
  const existing = await readChannelOverrides();
  const prev = existing[channelId];
  const next: ChannelAccountOverride = {
    channelId,
    youtubeAccountId: patch.youtubeAccountId !== undefined ? patch.youtubeAccountId : (prev?.youtubeAccountId ?? null),
    instagramAccountId: patch.instagramAccountId !== undefined ? patch.instagramAccountId : (prev?.instagramAccountId ?? null),
    telegramTopicId: patch.telegramTopicId !== undefined ? patch.telegramTopicId : (prev?.telegramTopicId ?? null),
  };
  await db
    .insert(channelAccounts)
    .values({ ...next, updatedBy: actorUserId, updatedAt: now } as never)
    .onConflictDoUpdate({
      target: channelAccounts.channelId,
      set: { ...next, updatedBy: actorUserId, updatedAt: now } as never,
    });
  return next;
}

/** DB override first, static config fallback (never throws). */
export async function resolveChannelAccountIdDb(
  channelId: string,
  platform: "youtube" | "instagram" | "telegram",
): Promise<string | null> {
  try {
    const overrides = await readChannelOverrides();
    const o = overrides[channelId];
    if (o) {
      if (platform === "youtube") return o.youtubeAccountId;
      if (platform === "instagram") return o.instagramAccountId;
      if (platform === "telegram") return o.telegramTopicId;
    }
  } catch {}
  const { getChannelAccounts } = await import("./channels");
  const accounts = getChannelAccounts(channelId);
  if (platform === "youtube") return accounts.youtubeAccountId;
  if (platform === "instagram") return accounts.instagramAccountId;
  return accounts.telegramTopicId;
}
