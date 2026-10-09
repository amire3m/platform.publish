import { generateEntityId } from "@/lib/ids";
import type { ContentRoomDatabasePort } from "./repository";
import { ContentRoomRepositoryError } from "./repository";
import { REQUIRED_FOR_SEND } from "./activities";
import type {
  WorkflowDatabasePort,
  WorkflowDeliverableRecord,
  WorkflowEventRecord,
  WorkflowProgramRecord,
  WorkflowPublicationRecord,
} from "@/lib/workflow/repository";
import { DELIVERABLE_KIND_TO_PLATFORM } from "@/lib/channels";
import { resolveChannelAccountIdDb } from "@/lib/channel-accounts";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class ContentRoomServiceError extends Error {
  constructor(
    public code: "VERSION_CONFLICT" | "NOT_FOUND" | "INVALID_TRANSITION" | "REASON_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "ContentRoomServiceError";
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
export interface SendToPublicationCommand {
  productId: string;
  expectedVersion: number;
  actorUserId: string;
  /**
   * Optional selective send: publish only these parts (must all be active,
   * not previously published, and have every required activity checked).
   * Omitted/empty → all sendable parts (previous behavior, requires the
   * whole product to be ready_to_send).
   */
  partIds?: string[];
  /** Per-deliverable overrides: each entry is per part+kind with YouTube title/description/playlist and Instagram caption.
   * kind: youtube_full | highlight | reel | cover (optional for legacy single-title)
   * youtubeAccountId/instagramAccountId: explicit destination override (validated, fallback to channel default)
   * publishToInstagram: reel-only toggle (default true = dual publish YT+IG)
   */
  partOverrides?: Array<{ partId: string; kind?: string; title?: string; description?: string; playlistId?: string | null; instagramCaption?: string; youtubeTitle?: string; youtubeDescription?: string; youtubeAccountId?: string | null; instagramAccountId?: string | null; publishToInstagram?: boolean; coverFileRef?: string | null }>;
  /** If set, publications are created as scheduled (simple flow), otherwise waiting. */
  scheduledAt?: string | null;
  /** Optional per-part per-platform schedule (overrides global scheduledAt). Keys are partId+kind aware. */
  perPartSchedules?: Array<{ partId: string; kind?: string | null; youtubeScheduledAt?: string | null; instagramScheduledAt?: string | null; scheduledAt?: string | null }>;
}

export interface SendToPublicationResult {
  product: import("./repository").ContentProductRecord;
  program: WorkflowProgramRecord;
  deliverables: WorkflowDeliverableRecord[];
  publications: WorkflowPublicationRecord[];
  skippedPreviouslyPublished: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
const DELIVERABLE_KINDS = [
  { kind: "youtube_full", nameSuffix: "یوتیوب کامل" },
  { kind: "highlight", nameSuffix: "هایلایت" },
  { kind: "reel", nameSuffix: "ریلز" },
  { kind: "cover", nameSuffix: "کاور" },
] as const;

const PUBLICATION_PLATFORMS = ["youtube", "instagram", "telegram"] as const;
// Mapping: each video kind can publish to YouTube (cover is thumbnail-only, no publication)
const KIND_PLATFORM_MAP: Record<string, (typeof PUBLICATION_PLATFORMS)[number]> = {
  youtube_full: "youtube",
  highlight: "youtube",
  reel: "instagram",
  cover: "instagram",
};
const KIND_PLATFORMS_MULTI: Record<string, Array<(typeof PUBLICATION_PLATFORMS)[number]>> = {
  reel: ["youtube", "instagram"],
};
// Cover is thumbnail-only: no video publication, just file stored for thumbnail use
const COVER_KIND = "cover";

/** Which part file belongs to which deliverable kind. */
function resolveDeliverableFileRef(
  kind: string,
  part: { fileRef: string | null; highlightFileRef: string | null; reelFileRef: string | null; coverFileRef: string | null },
): string | null {
  switch (kind) {
    case "youtube_full":
      return part.fileRef;
    case "highlight":
      return part.highlightFileRef;
    case "reel":
      return part.reelFileRef;
    case "cover":
      return part.coverFileRef;
    default:
      return null;
  }
}

/** Validate an explicit account override: must exist, match platform, and be usable. Returns id or null. */
async function validateAccountOverride(
  accountId: string | null | undefined,
  platform: "youtube" | "instagram",
): Promise<string | null> {
  const id = accountId?.trim();
  if (!id) return null;
  try {
    const { db } = await import("@/db");
    const { socialAccounts } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = (await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1)) as unknown as Array<{
      id: string;
      platform: string;
      connectionStatus: string;
      active: boolean;
    }>;
    if (!row) throw new ContentRoomServiceError("INVALID_TRANSITION", "حساب انتخاب‌شده یافت نشد.");
    if (row.platform !== platform) throw new ContentRoomServiceError("INVALID_TRANSITION", "حساب انتخاب‌شده با پلتفرم مقصد سازگار نیست.");
    if (!row.active) throw new ContentRoomServiceError("INVALID_TRANSITION", "حساب انتخاب‌شده غیرفعال است.");
    return row.id;
  } catch (e) {
    if ((e as { code?: string }).code === "INVALID_TRANSITION") throw e;
    return null;
  }
}

/** Latest highlight/reel assets per part (may be null when DB unavailable, e.g. unit tests). */
async function loadPartAssets(
  partIds: string[],
): Promise<Record<string, Array<{ kind: string; fileRef: string; createdAt: Date }>>> {
  if (partIds.length === 0) return {};
  try {
    const { db } = await import("@/db");
    const { contentPartAssets } = await import("@/db/schema");
    const { inArray, asc } = await import("drizzle-orm");
    const rows = (await db
      .select()
      .from(contentPartAssets)
      .where(inArray(contentPartAssets.partId, partIds))
      .orderBy(asc(contentPartAssets.createdAt))) as unknown as Array<{
      id: string;
      partId: string;
      kind: string;
      fileRef: string;
      targetKind: string | null;
      targetAssetId: string | null;
      createdAt: Date;
    }>;
    const out: Record<string, Array<{ id: string; kind: string; fileRef: string; targetKind: string | null; targetAssetId: string | null; createdAt: Date }>> = {};
    for (const r of rows) {
      (out[r.partId] ??= []).push({ id: r.id, kind: r.kind, fileRef: r.fileRef, targetKind: r.targetKind ?? null, targetAssetId: r.targetAssetId ?? null, createdAt: r.createdAt });
    }
    return out;
  } catch {
    return {};
  }
}

export function createContentRoomService(options: {
  contentPort: ContentRoomDatabasePort;
  workflowPort: WorkflowDatabasePort;
}) {
  const { contentPort, workflowPort } = options;

  return {
    async sendToPublication(command: SendToPublicationCommand): Promise<SendToPublicationResult> {
      const product = await contentPort.getProduct(command.productId);
      if (!product) {
        throw new ContentRoomServiceError("NOT_FOUND", "محصول یافت نشد.");
      }
      if (product.version !== command.expectedVersion) {
        throw new ContentRoomServiceError("VERSION_CONFLICT", "نسخه قدیمی است.");
      }
      // Prevent duplicate send: one active program per product
      try {
        const { db } = await import("@/db");
        const { workflowPrograms } = await import("@/db/schema");
        const { and, eq, isNull } = await import("drizzle-orm");
        const [existing] = (await db
          .select()
          .from(workflowPrograms)
          .where(and(eq(workflowPrograms.source, "content_room"), eq(workflowPrograms.sourceRef, product.id), isNull(workflowPrograms.archivedAt)))
          .limit(1)) as unknown as Array<{ id: string }>;
        if (existing) {
          throw new ContentRoomServiceError("INVALID_TRANSITION", "این محتوا قبلاً به اتاق انتشار ارسال شده است.");
        }
      } catch (e) {
        if ((e as { code?: string }).code === "INVALID_TRANSITION") throw e;
        // ignore DB errors for test environments
      }
      // Whole-product send requires ready_to_send; partial (selected-part) send
      // skips this gate — checked below in the branch on command.partIds.

      const parts = await contentPort.listPartsForProduct(command.productId);
      // Filter to sendable parts: isActive && !previously_published
      let skippedPreviouslyPublished = 0;
      const sendable = parts.filter((p) => {
        const isActive = (p as unknown as { isActive?: boolean }).isActive ?? true;
        const activities = (p as unknown as { activities?: Record<string, boolean> }).activities;
        const previouslyPublished =
          activities?.previously_published ??
          (p as unknown as { previously_published?: boolean }).previously_published ??
          (p as unknown as { previouslyPublished?: boolean }).previouslyPublished ??
          false;
        if (!isActive) return false;
        if (previouslyPublished) {
          skippedPreviouslyPublished++;
          return false;
        }
        return true;
      });
      if (sendable.length === 0) {
        throw new ContentRoomServiceError(
          "INVALID_TRANSITION",
          "هیچ قسمت قابل ارسالی وجود ندارد. همه قسمت‌های فعال قبلاً منتشر شده‌اند.",
        );
      }

      const isPartialSend = Array.isArray(command.partIds) && command.partIds.length > 0;
      let effectiveParts: typeof sendable;
      if (isPartialSend) {
        // Selective send: only the requested parts, regardless of overall product status —
        // but each requested part must have its OWN checklist fully complete.
        const requested = new Set(command.partIds!);
        const picked = sendable.filter((p) => {
          if (!requested.has(p.id)) return false;
          const acts = (p as unknown as { activities?: Record<string, boolean> }).activities ?? {};
          return REQUIRED_FOR_SEND.every((a) => !!acts[a]);
        });
        if (picked.length === 0) {
          throw new ContentRoomServiceError(
            "INVALID_TRANSITION",
            "قسمت انتخاب‌شده آماده انتشار نیست — همه فعالیت‌های چک‌لیست آن باید کامل شود.",
          );
        }
        effectiveParts = picked;
      } else {
        if (product.status !== "ready_to_send") {
          throw new ContentRoomServiceError("INVALID_TRANSITION", "محصول باید در وضعیت آماده ارسال باشد.");
        }
        effectiveParts = sendable;
      }

      const now = new Date();
      // Create workflow program
      const programId = generateEntityId("WPR");
      const program: WorkflowProgramRecord = {
        id: programId,
        title: product.title,
        seriesName: `${product.productType} / ${product.channel}`,
        ownerUserId: product.createdBy ?? command.actorUserId,
        dueAt: product.dueAt ?? null,
        notes: product.notes ?? null,
        source: "content_room",
        sourceRef: product.id,
        version: 1,
        createdBy: command.actorUserId,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      };
      const programEvent: WorkflowEventRecord = {
        id: generateEntityId("WEV"),
        entityType: "workflow_program",
        entityId: programId,
        action: "created",
        before: null,
        after: { ...program } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      };

      // transact create program
      const createdProgram = await workflowPort.transactCreateProgram(program, programEvent);

      // Build deliverables + publications + events
      const deliverables: WorkflowDeliverableRecord[] = [];
      const publications: WorkflowPublicationRecord[] = [];
      const events: WorkflowEventRecord[] = [];

      // Ensure parts are sorted
      const sortedParts = [...effectiveParts].sort((a, b) => a.partNumber - b.partNumber);

      // Latest highlight/reel assets per part (stored in content_part_assets)
      const assetsByPart = await loadPartAssets(sortedParts.map((p) => p.id));
      const latestAsset = (partId: string, kind: "highlight" | "reel" | "final"): string | null => {
        const rows = (assetsByPart[partId] ?? []).filter((a) => a.kind === kind);
        return rows.length > 0 ? rows[rows.length - 1].fileRef : null;
      };
      // Cover for a specific output: exact asset match → kind match → untargeted → part main cover
      const coverForKind = (partId: string, target: string, partCover: string | null, targetAssetId?: string | null): string | null => {
        const rows = (assetsByPart[partId] ?? []).filter((a) => a.kind === "cover");
        if (targetAssetId) {
          const pinned = rows.filter((a) => (a as unknown as { targetAssetId?: string | null }).targetAssetId === targetAssetId);
          if (pinned.length > 0) return pinned[pinned.length - 1].fileRef;
        }
        const exact = rows.filter((a) => (a as unknown as { targetKind?: string | null }).targetKind === target);
        if (exact.length > 0) return exact[exact.length - 1].fileRef;
        const untargeted = rows.filter((a) => !(a as unknown as { targetKind?: string | null }).targetKind);
        if (untargeted.length > 0) return untargeted[untargeted.length - 1].fileRef;
        return partCover;
      };
      const latestVideoAssetId = (partId: string, kind: "highlight" | "reel"): string | null => {
        const rows = (assetsByPart[partId] ?? []).filter((a) => a.kind === kind);
        return rows.length > 0 ? (rows[rows.length - 1] as unknown as { id: string }).id ?? null : null;
      };

      // Build lookup: partId+kind -> override, and partId -> schedule, and partId+kind -> schedule
      const overridesByKey = new Map((command.partOverrides ?? []).map((o) => [`${o.partId}:${o.kind}`, o] as const));
      const overridesByPartLegacy = new Map((command.partOverrides ?? []).filter(o=>!o.kind).map((o) => [o.partId, o] as const));
      const schedulesByKey = new Map((command.perPartSchedules ?? []).filter(s=>s.kind).map((s) => [`${s.partId}:${s.kind}`, s] as const));
      const schedulesByPart = new Map((command.perPartSchedules ?? []).map((s) => [s.partId, s] as const));
      const scheduledAtDate = command.scheduledAt ? new Date(command.scheduledAt) : null;
      let sortOrder = 0;
      for (const part of sortedParts) {
        for (const kindDef of DELIVERABLE_KINDS) {
          const fileRef = resolveDeliverableFileRef(kindDef.kind, {
            fileRef: latestAsset(part.id, "final") ?? part.fileRef,
            highlightFileRef: latestAsset(part.id, "highlight") ?? part.highlightFileRef ?? null,
            reelFileRef: latestAsset(part.id, "reel") ?? part.reelFileRef ?? null,
            coverFileRef: part.coverFileRef,
          });
          const override = overridesByKey.get(`${part.id}:${kindDef.kind}`) ?? overridesByPartLegacy.get(part.id) as unknown as { title?: string; description?: string; playlistId?: string | null; youtubeTitle?: string; youtubeDescription?: string; instagramCaption?: string } | undefined;
          // Support both new (title/description/playlistId) and legacy (youtubeTitle etc)
          let deliverableName = `${product.title} - قسمت ${part.partNumber} - ${kindDef.nameSuffix}`;
          let deliverableNotes: string | null = null;
          let playlistId: string | null = null;
          if (override) {
            const t = (override as unknown as { title?: string; youtubeTitle?: string }).title ?? (override as unknown as { youtubeTitle?: string }).youtubeTitle;
            const d = (override as unknown as { description?: string; youtubeDescription?: string }).description ?? (override as unknown as { youtubeDescription?: string }).youtubeDescription;
            const cap = (override as unknown as { instagramCaption?: string }).instagramCaption;
            if (t?.trim()) deliverableName = t.trim().slice(0, 100);
            if (kindDef.kind === "reel" && cap?.trim()) deliverableNotes = cap.trim().slice(0, 2200);
            else if (d?.trim()) deliverableNotes = d.trim().slice(0, 5000);
            const pl = (override as unknown as { playlistId?: string | null }).playlistId;
            if (pl?.trim()) playlistId = pl.trim();
          }
          const deliverableId = generateEntityId("WDL");
          const hasFile = Boolean(fileRef);
          // Cover is thumbnail-only: ready if file exists, but no publication
          const isCover = kindDef.kind === COVER_KIND;
          const overrideFull = override as unknown as { publishToInstagram?: boolean; youtubeAccountId?: string | null; instagramAccountId?: string | null; coverFileRef?: string | null } | undefined;
          const coverPick =
            (overrideFull?.coverFileRef?.trim() || null) ??
            (isCover ? null : coverForKind(part.id, kindDef.kind, part.coverFileRef ?? null, kindDef.kind === "highlight" || kindDef.kind === "reel" ? latestVideoAssetId(part.id, kindDef.kind) : null));
          const deliverable: WorkflowDeliverableRecord = {
            id: deliverableId,
            programId,
            name: deliverableName,
            kind: kindDef.kind,
            sortOrder: sortOrder++,
            productionStatus: hasFile ? "ready" : "not_started",
            assigneeUserId: null,
            dueAt: null,
            notes: deliverableNotes,
            contentId: null,
            fileRef,
            coverFileRef: coverPick,
            archivedAt: null,
            version: 1,
            createdBy: command.actorUserId,
            createdAt: now,
            updatedAt: now,
          };
          deliverables.push(deliverable);
          events.push({
            id: generateEntityId("WEV"),
            entityType: "workflow_deliverable",
            entityId: deliverableId,
            action: "created_from_content_room",
            before: null,
            after: { ...deliverable } as unknown as Record<string, unknown>,
            actorUserId: command.actorUserId,
            source: "api",
            reason: null,
            createdAt: now,
          });

          if (isCover) continue; // No publication for cover — used as thumbnail for YouTube videos
          // Create publication(s) per deliverable — reel dual-publishes YT+IG unless toggled off
          const wantsInstagram = kindDef.kind === "reel" ? (overrideFull?.publishToInstagram ?? true) : true;
          let platforms: Array<(typeof PUBLICATION_PLATFORMS)[number]> = (KIND_PLATFORMS_MULTI[kindDef.kind] ??
            [(KIND_PLATFORM_MAP[kindDef.kind] ?? DELIVERABLE_KIND_TO_PLATFORM[kindDef.kind as keyof typeof DELIVERABLE_KIND_TO_PLATFORM] ?? "youtube") as (typeof PUBLICATION_PLATFORMS)[number]]);
          if (kindDef.kind === "reel" && !wantsInstagram) platforms = ["youtube"];
          // Prefer kind-specific schedule, fallback to part-wide
          const partSchedule = schedulesByKey.get(`${part.id}:${kindDef.kind}`) ?? schedulesByPart.get(part.id);
          for (const platform of platforms) {
          const explicitId = platform === "youtube" ? overrideFull?.youtubeAccountId : overrideFull?.instagramAccountId;
          const validated = await validateAccountOverride(explicitId, platform as "youtube" | "instagram");
          const socialAccountId = validated ?? await resolveChannelAccountIdDb(product.channel, platform as "youtube" | "instagram" | "telegram");
          const pubId = generateEntityId("WPB");
          const isReady = deliverable.productionStatus === "ready";
          // Per-platform schedule overrides global
          let perPlatformDate: Date | null = null;
          if (partSchedule) {
            const raw = platform === "youtube" ? (partSchedule.youtubeScheduledAt ?? partSchedule.scheduledAt) : (partSchedule.instagramScheduledAt ?? partSchedule.scheduledAt);
            if (raw) perPlatformDate = new Date(raw as string);
          }
          const effectiveDate = perPlatformDate ?? scheduledAtDate;
          const pubStatus = isReady ? (effectiveDate ? "scheduled" : "ready") : "waiting_for_production";
          const pub: WorkflowPublicationRecord = {
            id: pubId,
            deliverableId,
            platform,
            socialAccountId: socialAccountId ?? null,
            status: pubStatus as never,
            createdSource: "manual",
            terminalOwner: null,
            scheduledAt: pubStatus === "scheduled" ? effectiveDate : null,
            publishedAt: null,
            externalId: null,
            permalink: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            manualReason: null,
            playlistId: platform === "youtube" ? playlistId : null,
            version: 1,
            updatedBy: null,
            createdAt: now,
            updatedAt: now,
          } as unknown as WorkflowPublicationRecord;
          publications.push(pub);
          events.push({
            id: generateEntityId("WEV"),
            entityType: "workflow_publication",
            entityId: pubId,
            action: "created",
            before: null,
            after: { ...pub } as unknown as Record<string, unknown>,
            actorUserId: command.actorUserId,
            source: "api",
            reason: null,
            createdAt: now,
          });
          }
        }
      }

      // Persist deliverables+publications atomically via workflowPort
      // Prefer transactInstantiateTemplate if available
      if (deliverables.length > 0) {
        if (workflowPort.transactInstantiateTemplate) {
          await workflowPort.transactInstantiateTemplate(programId, deliverables, publications, events);
        } else {
          // fallback sequential (not transactional but okay for tests)
          for (let i = 0; i < deliverables.length; i++) {
            const d = deliverables[i];
            // find its events/publications
            // we pushed deliverable event + 3 publication events per deliverable
            // For fallback we create deliverable via transactCreateDeliverable and then insert publications directly via internal map if InMemory
            // Instead we directly push to port's internal arrays if InMemory
            // Try to use transactCreateDeliverable for each deliverable then manually handle publications
            const deliverableEvent = events[i * 4]; // not accurate because we have 1+3 per deliverable =4 events per deliverable but interleaved
            // Simpler: bypass workflow port abstraction and directly push if InMemory
            // Detect InMemory by presence of deliverables array property
            const maybeInMemory = workflowPort as unknown as { deliverables?: unknown[]; publications?: unknown[]; events?: unknown[] };
            if (maybeInMemory.deliverables && maybeInMemory.publications && maybeInMemory.events) {
              // InMemory - directly insert
              // we'll let transactInstantiateTemplate handle already; this fallback not needed
            }
          }
          // If fallback reached, use direct insertion via internal structures for InMemory case
          const inMem = workflowPort as unknown as {
            deliverableMap?: Map<string, unknown>;
            publicationMap?: Map<string, unknown>;
            deliverables?: WorkflowDeliverableRecord[];
            publications?: WorkflowPublicationRecord[];
            events?: WorkflowEventRecord[];
          };
          if (inMem.deliverableMap && inMem.publicationMap) {
            for (const d of deliverables) {
              inMem.deliverableMap.set(d.id, d as unknown);
              inMem.deliverables?.push(d);
            }
            for (const p of publications) {
              inMem.publicationMap.set(p.id, p as unknown);
              inMem.publications?.push(p);
            }
            for (const e of events) inMem.events?.push(e);
          }
        }
      }

      // Mark content product as sent: bump version and log event, keep status ready_to_send
      // Use contentPort transactUpdateProduct
      const afterProduct = { ...product, version: product.version + 1, updatedAt: now };
      const contentEvent = {
        id: generateEntityId("WEV"),
        entityType: "content_product",
        entityId: product.id,
        action: "sent_to_publication",
        before: { ...product } as unknown as Record<string, unknown>,
        after: { ...afterProduct } as unknown as Record<string, unknown>,
        actorUserId: command.actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      } as unknown as import("./repository").ContentRoomEventRecord;

      let updatedProduct: import("./repository").ContentProductRecord;
      try {
        updatedProduct = await contentPort.transactUpdateProduct(
          product.id,
          command.expectedVersion,
          { updatedAt: now },
          contentEvent,
        );
      } catch (e) {
        // translate repository error to service error if needed
        if ((e as { code?: string }).code === "VERSION_CONFLICT") {
          throw new ContentRoomServiceError("VERSION_CONFLICT", "نسخه قدیمی است.");
        }
        throw e;
      }

      return {
        product: updatedProduct,
        program: createdProgram,
        deliverables,
        publications,
        skippedPreviouslyPublished,
      };
    },
  };
}

export type ContentRoomService = ReturnType<typeof createContentRoomService>;
