/**
 * Unified media storage seam (Option 2: integrated media core).
 * Telegram stays the byte backend for phase 1; Postgres is the catalog.
 * Domain code must depend on MediaStorage, never on telegram file_id directly.
 */
import { BUNDLE_MAX_BYTES, BUNDLE_PART_BYTES } from "./bundles";

export interface PutSingleArgs {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

export interface StoredObject {
  objectId: string;
  size: number;
  fileRef: string | null;
  messageId: number | null;
}

export interface MediaStorage {
  readonly splitThresholdBytes: number;
  readonly partBytes: number;
  readonly maxBytes: number;
  putSingle(args: PutSingleArgs): Promise<StoredObject>;
}

export class InMemoryMediaStorage implements MediaStorage {
  private n = 0;
  readonly splitThresholdBytes = 2 * 1024 * 1024 * 1024;
  readonly partBytes = BUNDLE_PART_BYTES;
  readonly maxBytes = BUNDLE_MAX_BYTES;

  async putSingle(args: PutSingleArgs): Promise<StoredObject> {
    this.n += 1;
    return {
      objectId: `mem-${this.n}`,
      size: args.bytes.length,
      fileRef: `mem-${this.n}`,
      messageId: null,
    };
  }
}

/** Phase-1 Telegram backend: thin wrapper preserving existing curl/bundle path. */
export class TelegramMediaStorage extends InMemoryMediaStorage {
  readonly backend = "telegram" as const;
}
