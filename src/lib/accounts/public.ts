export interface PublicAccountDto {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  profileImage: string | null;
  active: boolean;
  connectionStatus: string;
  topicId: string | null;
  topicLabel: string | null;
  lastSyncAt: string | null;
  capabilities: Record<string, unknown>;
}

export interface PublicAccountSource extends Record<string, unknown> {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  profileImage: string | null;
  active: boolean;
  connectionStatus: string;
  topicId: string | null;
  topicLabel: string | null;
  lastSyncAt: Date | string | null;
  capabilities: Record<string, unknown>;
}

export function toPublicAccountDto(account: PublicAccountSource): PublicAccountDto {
  return {
    id: account.id,
    platform: account.platform,
    username: account.username,
    displayName: account.displayName,
    profileImage: account.profileImage,
    active: account.active,
    connectionStatus: account.connectionStatus,
    topicId: account.topicId,
    topicLabel: account.topicLabel,
    lastSyncAt: account.lastSyncAt instanceof Date ? account.lastSyncAt.toISOString() : account.lastSyncAt,
    capabilities: account.capabilities,
  };
}
