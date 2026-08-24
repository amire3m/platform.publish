import type { Asset, AssetFilters, AssetType, AssetVersion } from "./types";
import { generateEntityId } from "@/lib/ids";
import { buildTelegramMediaUrl } from "@/lib/media/telegram-url";

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// In-memory store (stub) - also used as fallback when DB not reachable
// ---------------------------------------------------------------------------
const memoryAssets = new Map<string, Asset>();

function seedAssets(): Asset[] {
  if (memoryAssets.size > 0) return Array.from(memoryAssets.values());
  const samples: Array<Omit<Asset, "thumbnailUrl" | "versions"> & { thumbnailUrl?: string | null; versions?: AssetVersion[] }> = [
    {
      id: "AST-1405-000001",
      telegramFileId: "sample_file_video_1",
      type: "video",
      filename: "teaser_zed_revayat.mp4",
      size: 42_300_000,
      mime: "video/mp4",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      channelId: "zed_revayat",
      tags: ["تیزر", "ضد روایت"],
      version: 2,
      thumbnailUrl: null,
      versions: [
        { version: 1, telegramFileId: "sample_file_video_1_v1", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(), size: 40_000_000, mime: "video/mp4", filename: "teaser_zed_revayat_v1.mp4" },
        { version: 2, telegramFileId: "sample_file_video_1", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), size: 42_300_000, mime: "video/mp4", filename: "teaser_zed_revayat.mp4" },
      ],
    },
    {
      id: "AST-1405-000002",
      telegramFileId: "sample_file_image_1",
      type: "image",
      filename: "poster_tamashin.jpg",
      size: 2_400_000,
      mime: "image/jpeg",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      channelId: "tamashin",
      tags: ["پوستر"],
      version: 1,
      thumbnailUrl: null,
      versions: [
        { version: 1, telegramFileId: "sample_file_image_1", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), size: 2_400_000, mime: "image/jpeg", filename: "poster_tamashin.jpg" },
      ],
    },
    {
      id: "AST-1405-000003",
      telegramFileId: "sample_file_cover_1",
      type: "cover",
      filename: "cover_shock.jpg",
      size: 1_800_000,
      mime: "image/jpeg",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      channelId: "shock",
      tags: ["کاور", "شوک"],
      version: 1,
      thumbnailUrl: null,
      versions: [
        { version: 1, telegramFileId: "sample_file_cover_1", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(), size: 1_800_000, mime: "image/jpeg", filename: "cover_shock.jpg" },
      ],
    },
    {
      id: "AST-1405-000004",
      telegramFileId: "sample_file_video_2",
      type: "video",
      filename: "highlight_zaviye_no.mp4",
      size: 68_000_000,
      mime: "video/mp4",
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      channelId: "zaviye_no",
      tags: ["هایلایت"],
      version: 1,
      thumbnailUrl: null,
      versions: [
        { version: 1, telegramFileId: "sample_file_video_2", createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), size: 68_000_000, mime: "video/mp4", filename: "highlight_zaviye_no.mp4" },
      ],
    },
    {
      id: "AST-1405-000005",
      telegramFileId: "sample_file_image_2",
      type: "image",
      filename: "tinazh_doc_cover.png",
      size: 3_100_000,
      mime: "image/png",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      channelId: "tinazh",
      tags: ["مستند", "کاور"],
      version: 1,
      thumbnailUrl: null,
      versions: [
        { version: 1, telegramFileId: "sample_file_image_2", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), size: 3_100_000, mime: "image/png", filename: "tinazh_doc_cover.png" },
      ],
    },
    {
      id: "AST-1405-000006",
      telegramFileId: "sample_file_cover_2",
      type: "cover",
      filename: "iranian_frame_cover.jpg",
      size: 2_050_000,
      mime: "image/jpeg",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      channelId: "iranian_frame",
      tags: ["کاور"],
      version: 1,
      thumbnailUrl: null,
      versions: [
        { version: 1, telegramFileId: "sample_file_cover_2", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), size: 2_050_000, mime: "image/jpeg", filename: "iranian_frame_cover.jpg" },
      ],
    },
  ];

  for (const s of samples) {
    const proxied = buildTelegramMediaUrl(s.telegramFileId, s.mime);
    const asset: Asset = {
      ...s,
      thumbnailUrl: proxied,
    } as Asset;
    // For demo, thumbnailUrl for images is a placeholder via proxy if not sample
    memoryAssets.set(asset.id, asset);
  }
  return Array.from(memoryAssets.values());
}

// Ensure seeded lazily
function ensureSeeded() {
  if (memoryAssets.size === 0) seedAssets();
}

// ---------------------------------------------------------------------------
// Helpers to derive assets from DB (content_parts + content media) - drizzle fallback
// ---------------------------------------------------------------------------
async function tryLoadFromDb(): Promise<Asset[] | null> {
  try {
    const { db } = await import("@/db");
    const { contentParts, contentProducts, content } = await import("@/db/schema");
    const partRows = await db.select().from(contentParts).limit(200);
    const productRows = await db.select().from(contentProducts).limit(200);
    const contentRows = await db.select().from(content).limit(200);

    const channelByProduct = new Map<string, string>();
    for (const pr of productRows as unknown as Array<{ id: string; channel: string }>) {
      channelByProduct.set(pr.id, pr.channel);
    }

    const assets: Asset[] = [];

    for (const part of partRows as unknown as Array<{ id: string; productId: string; fileRef: string | null; coverFileRef: string | null; createdAt: Date; updatedAt: Date; version: number }>) {
      const channelId = channelByProduct.get(part.productId) ?? null;
      if (part.fileRef) {
        const inferredType: AssetType = part.fileRef.endsWith(".jpg") || part.fileRef.endsWith(".png") ? "image" : "video";
        const isVideo = inferredType === "video";
        assets.push({
          id: `AST-${part.id}`,
          telegramFileId: part.fileRef,
          type: isVideo ? "video" : "video",
          filename: isVideo ? `part-${part.id}.mp4` : `part-${part.id}.jpg`,
          size: isVideo ? 50_000_000 : 2_000_000,
          mime: isVideo ? "video/mp4" : "image/jpeg",
          createdAt: (part.createdAt ?? new Date()).toISOString(),
          channelId,
          tags: [],
          version: part.version ?? 1,
          thumbnailUrl: buildTelegramMediaUrl(part.fileRef, "video/mp4"),
          versions: [
            { version: part.version ?? 1, telegramFileId: part.fileRef, createdAt: (part.createdAt ?? new Date()).toISOString(), filename: `part-${part.id}.mp4` },
          ],
        });
      }
      if (part.coverFileRef) {
        assets.push({
          id: `AST-${part.id}-cover`,
          telegramFileId: part.coverFileRef,
          type: "cover",
          filename: `cover-${part.id}.jpg`,
          size: 1_500_000,
          mime: "image/jpeg",
          createdAt: (part.updatedAt ?? new Date()).toISOString(),
          channelId,
          tags: ["کاور"],
          version: part.version ?? 1,
          thumbnailUrl: buildTelegramMediaUrl(part.coverFileRef, "image/jpeg"),
          versions: [
            { version: 1, telegramFileId: part.coverFileRef, createdAt: (part.updatedAt ?? new Date()).toISOString(), filename: `cover-${part.id}.jpg` },
          ],
        });
      }
    }

    for (const c of contentRows as unknown as Array<{ id: string; media: unknown[]; createdAt: Date; tags: string[] | null }>) {
      const mediaArr = Array.isArray(c.media) ? c.media : [];
      for (const m of mediaArr as Array<{ file_id?: string; file_ref?: string; telegramFileId?: string; filename?: string; mime?: string; size?: number; type?: string }>) {
        const fileId = m.file_id ?? m.file_ref ?? m.telegramFileId;
        if (!fileId) continue;
        // avoid duplicates already added via parts
        if (assets.some((a) => a.telegramFileId === fileId)) continue;
        const mime = m.mime ?? "video/mp4";
        const inferred: AssetType = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "video";
        assets.push({
          id: `AST-${c.id}-${fileId.slice(0, 6)}`,
          telegramFileId: fileId,
          type: inferred,
          filename: m.filename ?? `${c.id}.${inferred === "video" ? "mp4" : "jpg"}`,
          size: m.size ?? 10_000_000,
          mime,
          createdAt: (c.createdAt ?? new Date()).toISOString(),
          channelId: null,
          tags: c.tags ?? [],
          version: 1,
          thumbnailUrl: buildTelegramMediaUrl(fileId, mime),
          versions: [{ version: 1, telegramFileId: fileId, createdAt: (c.createdAt ?? new Date()).toISOString(), filename: m.filename ?? fileId }],
        });
      }
    }

    // Merge memory overrides for tags/versions if memory has same id
    for (const mem of memoryAssets.values()) {
      const idx = assets.findIndex((a) => a.id === mem.id);
      if (idx >= 0) {
        // merge tags and versions from memory (preserve user edits)
        assets[idx] = { ...assets[idx], tags: mem.tags, version: mem.version, versions: mem.versions, thumbnailUrl: assets[idx].thumbnailUrl ?? mem.thumbnailUrl };
      }
    }

    if (assets.length > 0) return assets;
    return null;
  } catch {
    return null;
  }
}

async function getAllAssets(): Promise<Asset[]> {
  const fromDb = await tryLoadFromDb();
  if (fromDb && fromDb.length > 0) {
    // also ensure memory seeded assets are included if not duplicated
    ensureSeeded();
    const mem = Array.from(memoryAssets.values());
    for (const m of mem) {
      if (!fromDb.some((a) => a.id === m.id)) fromDb.push(m);
    }
    // enrich thumbnailUrl for sample ids: keep null (no proxy)
    return fromDb;
  }
  ensureSeeded();
  return Array.from(memoryAssets.values());
}

function applyFilters(assets: Asset[], filters: AssetFilters): Asset[] {
  let result = [...assets];
  if (filters.query) {
    const q = filters.query.toLowerCase().trim();
    if (q) {
      result = result.filter((a) => a.filename.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q)) || a.id.toLowerCase().includes(q));
    }
  }
  if (filters.type) {
    result = result.filter((a) => a.type === filters.type);
  }
  if (filters.channel) {
    result = result.filter((a) => a.channelId === filters.channel);
  }
  if (filters.tag) {
    const t = filters.tag.toLowerCase();
    result = result.filter((a) => a.tags.some((x) => x.toLowerCase() === t || x.toLowerCase().includes(t)));
  }
  // newest first
  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return result;
}

export async function listAssets(filters: AssetFilters = {}): Promise<Asset[]> {
  const all = await getAllAssets();
  return applyFilters(all, filters);
}

export async function search(query: string, filters: Omit<AssetFilters, "query"> = {}): Promise<Asset[]> {
  return listAssets({ ...filters, query });
}

export async function getAsset(id: string): Promise<Asset | null> {
  const all = await getAllAssets();
  const found = all.find((a) => a.id === id) ?? memoryAssets.get(id) ?? null;
  if (found) return found;
  return null;
}

export async function addTag(id: string, tag: string): Promise<Asset> {
  const normalized = tag.trim();
  if (!normalized) throw new Error("برچسب نمی‌تواند خالی باشد.");
  if (normalized.length > 30) throw new Error("برچسب نباید بیش از ۳۰ کاراکتر باشد.");
  ensureSeeded();
  // try to find in memory first; if from DB, we create an overlay entry in memory
  let asset = memoryAssets.get(id) ?? (await getAsset(id));
  if (!asset) throw new Error("دارایی یافت نشد.");
  // clone into memory if not already there (so edits persist in stub mode)
  if (!memoryAssets.has(id)) {
    memoryAssets.set(id, { ...asset, tags: [...asset.tags], versions: asset.versions ? [...asset.versions] : [] });
    asset = memoryAssets.get(id)!;
  }
  if (!asset.tags.includes(normalized)) {
    asset.tags = [...asset.tags, normalized];
  }
  // also try to persist via TGDB if possible (best-effort)
  try {
    const { db } = await import("@/db");
    // No dedicated assets table; we keep tags in memory stub only.
    // If asset originated from contentParts/content, we could persist to audit log.
    void db;
  } catch {
    // ignore
  }
  // best-effort Telegram sync: append audit event or TGDB message (optional)
  try {
    const { buildTgdbMessage } = await import("@/lib/telegram/tgdb");
    const { TelegramClient, getTelegramConfig } = await import("@/lib/telegram/client");
    const cfg = getTelegramConfig();
    if (cfg) {
      const client = new TelegramClient(cfg);
      const msg = buildTgdbMessage("asset_tag", { id, tag: normalized, updated_at: nowIso() });
      await client.sendMessage(msg);
    }
  } catch {
    // non-fatal
  }
  return asset;
}

export async function createVersion(id: string, telegramFileId?: string, meta?: { filename?: string; size?: number; mime?: string }): Promise<Asset> {
  ensureSeeded();
  let asset = memoryAssets.get(id) ?? (await getAsset(id));
  if (!asset) throw new Error("دارایی یافت نشد.");
  if (!memoryAssets.has(id)) {
    memoryAssets.set(id, { ...asset, tags: [...asset.tags], versions: asset.versions ? [...asset.versions] : [] });
    asset = memoryAssets.get(id)!;
  }
  const newFileId = telegramFileId?.trim() || `tg_file_${generateEntityId("ANS").slice(4)}_${Date.now()}`;
  const nextVersion = (asset.version ?? 1) + 1;
  const now = nowIso();
  const versionEntry: AssetVersion = {
    version: nextVersion,
    telegramFileId: newFileId,
    createdAt: now,
    size: meta?.size,
    mime: meta?.mime,
    filename: meta?.filename ?? asset.filename,
  };
  asset.version = nextVersion;
  asset.telegramFileId = newFileId;
  if (meta?.filename) asset.filename = meta.filename;
  if (meta?.size) asset.size = meta.size;
  if (meta?.mime) asset.mime = meta.mime;
  asset.thumbnailUrl = buildTelegramMediaUrl(newFileId, asset.mime) ?? asset.thumbnailUrl ?? null;
  asset.versions = [...(asset.versions ?? []), versionEntry];
  asset.createdAt = now; // bump updated time

  // best-effort Telegram sync
  try {
    const { buildTgdbMessage } = await import("@/lib/telegram/tgdb");
    const { TelegramClient, getTelegramConfig } = await import("@/lib/telegram/client");
    const cfg = getTelegramConfig();
    if (cfg) {
      const client = new TelegramClient(cfg);
      const msg = buildTgdbMessage("asset_version", { id, version: nextVersion, telegram_file_id: newFileId, created_at: now });
      await client.sendMessage(msg);
    }
  } catch {
    // ignore
  }

  return asset;
}

// Re-export for convenience in tests
export const assetRepository = {
  listAssets,
  search,
  getAsset,
  addTag,
  createVersion,
};
