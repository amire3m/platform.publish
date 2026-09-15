export type BoardChannelId = "zaviye_no" | "zed_revayat" | "tamashin" | "iranian_frame";

export interface ChannelProfile {
  id: BoardChannelId;
  nameFa: string;
  tagline: string;
  color: string;
  softBg: string;
  monogram: string;
  contentTypes: string[];
  status: string[];
  progressNote: string;
}

export interface CsvRow {
  channel: string;
  date: string;
  videoTitle: string;
  program: string;
  contentType: string;
  views: number;
  watchMinutes: number;
  avgViewSeconds: number | null;
  impressions: number | null;
  ctr: number | null;
  likes: number;
  comments: number;
  shares: number;
  subsGained: number;
  subsLost: number;
  subsTotal: number | null;
  monetized: string;
  country: string;
  trafficSource: string;
  demo?: boolean;
}

export type DatasetSource = "demo" | "csv" | "mixed";

export interface BoardDataset {
  rows: CsvRow[];
  source: DatasetSource;
  fileName?: string;
  loadedAt?: string;
}

export type ProductionStatus =
  | "not_started"
  | "editing"
  | "edited"
  | "reviewing"
  | "ready"
  | "waiting_license"
  | "published"
  | "paused"
  | "needs_fix";

export interface ProductionItem {
  id: string;
  project: string;
  program: string;
  channel: string;
  contentType: string;
  episodes: number;
  editStatus: ProductionStatus;
  progress: number;
  reviewStatus: string;
  licenseStatus: string;
  publishStatus: string;
  owner: string;
  startDate: string;
  etaDate: string;
  notes: string;
}

export interface CollabItem {
  id: string;
  channels: string[];
  topic: string;
  format: string;
  status: string;
  owner: string;
  date: string;
  impact: string;
}

export interface LicenseItem {
  id: string;
  title: string;
  owner: string;
  licenseStatus: string;
  removalStatus: string;
  channel: string;
  fit: string;
  allowedDate: string;
  notes: string;
}

export interface IdeaItem {
  id: string;
  title: string;
  channel: string;
  contentType: string;
  audience: string;
  cost: string;
  duration: string;
  capacity: string;
  sponsor: string;
  status: string;
  priority: string;
  notes: string;
}

export interface InstagramSnapshot {
  followers: number | null;
  growth: string;
  posts: number | null;
  reels: number | null;
  views: string;
  engagement: string;
  needsInput?: boolean;
}
