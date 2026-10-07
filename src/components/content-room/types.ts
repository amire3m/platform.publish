import type { ContentStatus } from "@/lib/content-room/presentation";

export type ProductType = "serial" | "documentary" | "tv_program" | "film" | "short_film" | "educational" | "teaser" | "music_video" | "raw_video";
export type Channel = "zed_revayat" | "zaviye_no" | "tamashin" | "iranian_frame" | "shock" | "tinazh";

import { PART_ACTIVITIES, REQUIRED_FOR_SEND } from "@/lib/content-room/activities";
import type { PartActivity } from "@/lib/content-room/activities";

export { PART_ACTIVITIES, REQUIRED_FOR_SEND };
export type { PartActivity };

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
  /** Active parts with a real linked video file (list enrichment). */
  linkedParts?: number | null;
  /** Active parts total (list enrichment). */
  linkTotal?: number | null;
}

export interface ContentPart {
  id: string;
  productId: string;
  partNumber: number;
  fileRef?: string | null;
  coverFileRef?: string | null;
  highlightFileRef?: string | null;
  reelFileRef?: string | null;
  playbackUrl?: string | null;
  coverUrl?: string | null;
  highlightUrl?: string | null;
  reelUrl?: string | null;
  version?: number | null;
  status?: string | null;
  isActive?: boolean;
  activities?: Partial<Record<PartActivity, boolean>> & Record<string, boolean>;
  /** Per-activity audit: who checked each box and when. */
  activityMeta?: Record<string, { completedAt?: string | Date | null; completedBy?: string | null }>;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface ContentRoomProductDetail extends ContentRoomProductSummary {
  parts: ContentPart[];
  /** Latest publishing-room program this product was sent to (null = not sent yet). */
  sentProgram?: { id: string; createdAt: string } | null;
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
  /** List only products with at least one video-unlinked part. */
  onlyUnlinked?: boolean;
}
