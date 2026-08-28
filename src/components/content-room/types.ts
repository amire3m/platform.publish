import type { ContentStatus } from "@/lib/content-room/presentation";

export type ProductType = "serial" | "documentary" | "tv_program" | "film" | "short_film" | "educational" | "teaser" | "music_video";
export type Channel = "zed_revayat" | "zaviye_no" | "tamashin" | "iranian_frame" | "shock" | "tinazh";

export const PART_ACTIVITIES = [
  "editing_youtube",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
  "previously_published",
] as const;
export type PartActivity = (typeof PART_ACTIVITIES)[number];
export const REQUIRED_FOR_SEND: PartActivity[] = [
  "editing_youtube",
  "copyright_fix",
  "highlight_done",
  "reel_done",
  "cover_ready",
];

export type ContentPartActivityState = Record<PartActivity, boolean>;

export interface ContentRoomProductSummary {
  id: string;
  title: string;
  productType: ProductType | string;
  channel: Channel | string;
  partsCount: number;
  status: ContentStatus | string;
  version: number;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  dueAt?: string | Date | null;
  notes?: string | null;
  archivedAt?: string | Date | null;
  isCold?: boolean | null;
}

export interface ContentPart {
  id: string;
  productId: string;
  partNumber: number;
  fileRef?: string | null;
  coverFileRef?: string | null;
  playbackUrl?: string | null;
  coverUrl?: string | null;
  version?: number | null;
  status?: string | null;
  isActive?: boolean;
  activities?: Partial<Record<PartActivity, boolean>> & Record<string, boolean>;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface ContentRoomProductDetail extends ContentRoomProductSummary {
  parts: ContentPart[];
}

export interface ContentRoomFilters {
  query: string;
  productType: string;
  channel: string;
  status: string;
  dateFrom?: string;
  dateTo?: string;
  includeArchived?: boolean;
  sort?: string;
}
