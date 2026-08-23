export type AssetType = "video" | "image" | "cover";

export interface AssetVersion {
  version: number;
  telegramFileId: string;
  createdAt: string;
  size?: number;
  mime?: string;
  filename?: string;
}

export interface Asset {
  id: string;
  telegramFileId: string;
  type: AssetType;
  filename: string;
  size: number;
  mime: string;
  createdAt: string;
  channelId: string | null;
  tags: string[];
  version: number;
  thumbnailUrl?: string | null;
  versions?: AssetVersion[];
}

export interface AssetFilters {
  query?: string;
  type?: string;
  channel?: string;
  tag?: string;
}
