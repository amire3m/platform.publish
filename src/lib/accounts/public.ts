export interface PublicAccountDto {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  organization: "emro" | "sana" | null;
  profileImage: string | null;
  active: boolean;
  connectionStatus: string;
  topicId: string | null;
  topicLabel: string | null;
  lastSyncAt: string | null;
  capabilities: Record<string, unknown>;
  publishDailyCap: number | null;
  publishCooldownMin: number | null;
  publishWindowStart: string | null;
  publishWindowEnd: string | null;
  publishJitterMin: number;
  instantPost: boolean;
  publishedTodayCount: number;
}

export interface PublicAccountSource extends Record<string, unknown> {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  organization?: "emro" | "sana" | null;
  profileImage: string | null;
  active: boolean;
  connectionStatus: string;
  topicId: string | null;
  topicLabel: string | null;
  lastSyncAt: Date | string | null;
  capabilities: Record<string, unknown>;
  publishDailyCap?: number | null;
  publishCooldownMin?: number | null;
  publishWindowStart?: string | null;
  publishWindowEnd?: string | null;
  publishJitterMin?: number | null;
  instantPost?: boolean | null;
  publishedTodayCount?: number | null;
}

export function toPublicAccountDto(account: PublicAccountSource): PublicAccountDto {
  return {
    id: account.id,
    platform: account.platform,
    username: account.username,
    displayName: account.displayName,
    organization: account.organization ?? null,
    profileImage: account.profileImage,
    active: account.active,
    connectionStatus: account.connectionStatus,
    topicId: account.topicId,
    topicLabel: account.topicLabel,
    lastSyncAt: account.lastSyncAt instanceof Date ? account.lastSyncAt.toISOString() : account.lastSyncAt,
    capabilities: account.capabilities,
    publishDailyCap: account.publishDailyCap ?? null,
    publishCooldownMin: account.publishCooldownMin ?? null,
    publishWindowStart: account.publishWindowStart ?? null,
    publishWindowEnd: account.publishWindowEnd ?? null,
    publishJitterMin: account.publishJitterMin ?? 0,
    instantPost: account.instantPost ?? false,
    publishedTodayCount: account.publishedTodayCount ?? 0,
  };
}
