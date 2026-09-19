export interface PublishInput {
  accountExternalId: string;
  credentialPayload: Record<string, unknown> | null;
  fileBuffer: Buffer;
  /** Large-file path: when set, providers stream from disk instead of RAM. */
  filePath?: string | null;
  fileSize?: number | null;
  fileName: string;
  mimeType: string;
  contentType: string; // video|short|image|carousel|reel
  title?: string;
  description?: string;
  caption?: string;
  hashtags?: string[];
  privacyStatus?: string;
  tags?: string[];
  category?: string;
  madeForKids?: boolean;
  thumbnailBuffer?: Buffer | null;
  publishAtUtc?: string | null;
}

export interface PublishSuccess {
  ok: true;
  externalId: string;
  permalink: string;
  raw: Record<string, unknown>;
}

export interface PublishFailure {
  ok: false;
  errorCode: string;
  message: string;
  retryable: boolean;
  raw?: Record<string, unknown>;
}

export type PublishResult = PublishSuccess | PublishFailure;

export interface Provider {
  name: "youtube" | "instagram";
  isConfigured(): boolean;
  publish(input: PublishInput): Promise<PublishResult>;
}
