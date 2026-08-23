import type { ContentStatus } from "@/lib/content-room/presentation";

export type ProductType = "serial" | "documentary" | "tv_program" | "film" | "short_film" | "educational";
export type Channel = "zed_revayat" | "zaviye_no" | "tamashin" | "iranian_frame" | "shock" | "tinazh";

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
}

export interface ContentPart {
  id: string;
  productId: string;
  partNumber: number;
  fileRef?: string | null;
  status?: string | null;
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
}
