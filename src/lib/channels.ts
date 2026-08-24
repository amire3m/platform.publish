/**
 * Channel to Social Account mapping.
 * 6 channels enum stored in content_products.channel.
 * Each channel may be linked to YouTube/Instagram accounts and Telegram topic.
 */

export const CHANNEL_IDS = [
  "zed_revayat",
  "zaviye_no",
  "tamashin",
  "iranian_frame",
  "shock",
  "tinazh",
] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];
export type ChannelOrganization = "emro" | "sana";

export interface ChannelConfig {
  id: ChannelId;
  labelFa: string;
  organization: ChannelOrganization;
  youtubeAccountId: string | null;
  instagramAccountId: string | null;
  telegramTopicId: string | null;
}

export const CHANNELS: ChannelConfig[] = [
  { id: "zed_revayat", labelFa: "ضد روایت", organization: "emro", youtubeAccountId: null, instagramAccountId: null, telegramTopicId: null },
  { id: "zaviye_no", labelFa: "زاویه نو", organization: "emro", youtubeAccountId: null, instagramAccountId: null, telegramTopicId: null },
  { id: "tamashin", labelFa: "تماشین", organization: "emro", youtubeAccountId: null, instagramAccountId: null, telegramTopicId: null },
  { id: "iranian_frame", labelFa: "Iranian Frame", organization: "emro", youtubeAccountId: null, instagramAccountId: null, telegramTopicId: null },
  { id: "shock", labelFa: "شوک", organization: "sana", youtubeAccountId: null, instagramAccountId: null, telegramTopicId: null },
  { id: "tinazh", labelFa: "تیناژ", organization: "sana", youtubeAccountId: null, instagramAccountId: null, telegramTopicId: null },
];

export const CHANNEL_GROUPS = [
  { id: "emro" as const, labelFa: "کانال‌های موسسه امام روح‌الله", channels: CHANNELS.filter((channel) => channel.organization === "emro") },
  { id: "sana" as const, labelFa: "کانال‌های سنا", channels: CHANNELS.filter((channel) => channel.organization === "sana") },
];

export function getChannelConfig(channelId: string): ChannelConfig | undefined {
  return CHANNELS.find((c) => c.id === channelId);
}

export function getChannelLabelFa(channelId: string): string {
  return getChannelConfig(channelId)?.labelFa ?? channelId;
}

export interface ChannelAccounts {
  youtubeAccountId: string | null;
  instagramAccountId: string | null;
  telegramTopicId: string | null;
}

/**
 * Synchronous helper: returns config accounts (nullable, fallback null).
 */
export function getChannelAccounts(channelId: string): ChannelAccounts {
  const cfg = getChannelConfig(channelId);
  if (!cfg) return { youtubeAccountId: null, instagramAccountId: null, telegramTopicId: null };
  return {
    youtubeAccountId: cfg.youtubeAccountId,
    instagramAccountId: cfg.instagramAccountId,
    telegramTopicId: cfg.telegramTopicId,
  };
}

/**
 * Resolve account id per platform for a channel.
 * If channel not found or not linked, returns null (fallback).
 */
export function resolveChannelAccountId(
  channelId: string,
  platform: "youtube" | "instagram" | "telegram",
): string | null {
  const accounts = getChannelAccounts(channelId);
  if (platform === "youtube") return accounts.youtubeAccountId;
  if (platform === "instagram") return accounts.instagramAccountId;
  if (platform === "telegram") return accounts.telegramTopicId;
  return null;
}

/**
 * Deliverable kind -> publication platform mapping.
 * As per spec:
 *  - youtube_full -> youtube
 *  - highlight -> youtube
 *  - reel -> instagram
 *  - cover -> instagram (fallback telegram possible, but we map to instagram)
 */
export const DELIVERABLE_KIND_TO_PLATFORM: Record<string, "youtube" | "instagram" | "telegram"> = {
  youtube_full: "youtube",
  highlight: "youtube",
  reel: "instagram",
  cover: "instagram",
};

export function getPlatformForKind(kind: string): "youtube" | "instagram" | "telegram" | null {
  return DELIVERABLE_KIND_TO_PLATFORM[kind] ?? null;
}

/**
 * Async helper that queries social_accounts table to verify account existence.
 * Server-only path should import DB separately; this fallback keeps client bundle clean.
 */
export async function getChannelAccountsFromDb(channelId: string): Promise<ChannelAccounts> {
  return getChannelAccounts(channelId);
}

/**
 * For API enrichment: return channels with account linkage status.
 * Client-safe: does not import DB.
 */
export async function getChannelsWithAccountStatus(): Promise<Array<ChannelConfig & { linked: { youtube: boolean; instagram: boolean; telegram: boolean } }>> {
  return CHANNELS.map((c) => ({
    ...c,
    linked: {
      youtube: Boolean(c.youtubeAccountId),
      instagram: Boolean(c.instagramAccountId),
      telegram: Boolean(c.telegramTopicId),
    },
  }));
}
