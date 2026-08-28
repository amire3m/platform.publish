// -----------------------------------------------------------------------------
// TelegramDbRepository
// -----------------------------------------------------------------------------
// This module is the single gateway between the app and "Telegram as a
// database". Every write first tries to persist a structured `TGDB|v1`
// message into the correct Telegram topic, then mirrors the same data into
// the local Postgres index (src/db/schema.ts) so the UI stays fast. Reads for
// the panel are served from the local index; the panel always exposes a
// "مشاهده در تلگرام" link built from the stored message id so an operator can
// always verify the authoritative copy.
//
// If Telegram is not reachable/configured, writes still succeed locally but
// the row is flagged with `syncStatus: "degraded"` at the settings level and
// the event is recorded in the audit log — per the "no dangerous silent
// success" rule, callers must check `telegramSynced` before treating an
// operation as fully durable.
// -----------------------------------------------------------------------------
import { db } from "@/db";
import { appSettings, auditEvents, content, analyticsSnapshots, telegramTopics, socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TelegramClient, TelegramNotConfiguredError, getTelegramConfig } from "./client";
import { generateEntityId } from "@/lib/ids";
import { nowUtcIso } from "@/lib/date/jalali";
import { beautifyAnalytics, beautifyAudit, beautifyContent } from "./beautify";
import { buildContentKeyboard } from "./keyboards";

export const TGDB_MARKER = "TGDB|v1";

export function buildTgdbMessage(entity: string, payload: Record<string, unknown>): string {
  return `${TGDB_MARKER}\n${JSON.stringify({ entity, ...payload }, null, 2)}`;
}

export function parseTgdbMessage(text: string): Record<string, unknown> | null {
  if (!text?.startsWith(TGDB_MARKER)) return null;
  const jsonPart = text.slice(TGDB_MARKER.length).trim();
  try {
    return JSON.parse(jsonPart);
  } catch {
    return null;
  }
}

export async function sendBeautifulWithHidden(
  client: TelegramClient,
  tgdbText: string,
  beautiful: string | { text: string; parseMode?: string },
  replyMarkup: unknown,
  threadId?: number,
): Promise<{ beautifulMessageId: number; hiddenMessageId: number }> {
  const beautifulText = typeof beautiful === "string" ? beautiful : beautiful.text;
  const parseMode = typeof beautiful === "string" ? "HTML" : (beautiful.parseMode ?? "HTML");
  const beautifulMsg = await client.sendMessage(beautifulText, threadId, {
    parseMode: parseMode as never,
    replyMarkup: replyMarkup as never,
  });
  const hiddenMsg = await client.sendMessage(tgdbText, threadId, {
    disableNotification: true,
  } as never);
  return { beautifulMessageId: beautifulMsg.message_id, hiddenMessageId: hiddenMsg.message_id };
}

async function tryGetClient(): Promise<TelegramClient | null> {
  const cfg = getTelegramConfig();
  if (!cfg) return null;
  return new TelegramClient(cfg);
}

async function markSyncStatus(status: "ok" | "degraded" | "offline") {
  await db
    .insert(appSettings)
    .values({ id: 1, syncStatus: status, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.id, set: { syncStatus: status, updatedAt: new Date() } });
}

export async function getSyncStatus() {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return row?.syncStatus ?? "unknown";
}

// ---------------------------------------------------------------------------
// Content record lifecycle
// ---------------------------------------------------------------------------
export async function createContentRecord(input: {
  title: string;
  description: string;
  caption: string;
  hashtags: string[];
  platformTargets: Record<string, unknown>[];
  media: Record<string, unknown>[];
  status: string;
  approvalRequired: boolean;
  createdBy: string;
  scheduledAtJalali?: string | null;
  scheduledAtUtc?: string | null;
  sourceTopicId?: number | null;
  tags?: string[];
  notes?: string;
}) {
  const id = generateEntityId("CNT");
  const nowIso = nowUtcIso();
  let telegramSynced = false;
  let metadataMessageId: number | null = null;

  const client = await tryGetClient();
  if (client) {
    try {
      const tgdbText = buildTgdbMessage("content", {
        id,
        version: 1,
        status: input.status,
        created_at: nowIso,
        updated_at: nowIso,
        created_by: input.createdBy,
        source_topic_id: input.sourceTopicId ?? null,
        platform_targets: input.platformTargets,
        media: input.media,
        title: input.title,
        description: input.description,
        caption: input.caption,
        hashtags: input.hashtags,
        approval: { required: input.approvalRequired, status: "pending" },
        publication_results: [],
        error: null,
      });
      const beautiful = beautifyContent({
        id,
        title: input.title,
        status: input.status,
        approvalStatus: "pending",
        createdAt: nowIso,
        createdBy: input.createdBy,
        platformTargets: input.platformTargets as Array<{ platform: string }>,
        description: input.description,
      });
      const kb = buildContentKeyboard(id, input.status, "pending");
      const { beautifulMessageId } = await sendBeautifulWithHidden(
        client,
        tgdbText,
        beautiful,
        kb,
        input.sourceTopicId ?? undefined,
      );
      metadataMessageId = beautifulMessageId;
      telegramSynced = true;
      await markSyncStatus("ok");
    } catch (err) {
      await markSyncStatus("degraded");
      console.error("[tgdb] failed to write content metadata to Telegram:", (err as Error).message);
    }
  } else {
    await markSyncStatus("offline");
  }

  const [row] = await db
    .insert(content)
    .values({
      id,
      title: input.title,
      description: input.description,
      caption: input.caption,
      hashtags: input.hashtags,
      media: input.media,
      platformTargets: input.platformTargets,
      status: input.status,
      approvalRequired: input.approvalRequired,
      approvalStatus: "pending",
      createdBy: input.createdBy,
      scheduledAtJalali: input.scheduledAtJalali ?? null,
      scheduledAtUtc: input.scheduledAtUtc ? new Date(input.scheduledAtUtc) : null,
      sourceTopicId: input.sourceTopicId ?? null,
      metadataMessageId,
      telegramMessageIds: { metadataMessageId },
      tags: input.tags ?? [],
      notes: input.notes ?? null,
    })
    .returning();

  return { record: row, telegramSynced };
}

export async function updateContentRecord(
  id: string,
  patch: Partial<typeof content.$inferInsert>,
  opts?: { resync?: boolean },
) {
  const [existing] = await db.select().from(content).where(eq(content.id, id)).limit(1);
  if (!existing) throw new Error("محتوا یافت نشد.");

  const updated = { ...existing, ...patch, version: existing.version + 1, updatedAt: new Date() };

  if (opts?.resync !== false) {
    const client = await tryGetClient();
    if (client) {
      try {
        const tgdbText = buildTgdbMessage("content", {
          id: updated.id,
          version: updated.version,
          status: updated.status,
          created_at: existing.createdAt,
          updated_at: nowUtcIso(),
          created_by: updated.createdBy,
          source_topic_id: updated.sourceTopicId,
          platform_targets: updated.platformTargets,
          media: updated.media,
          title: updated.title,
          description: updated.description,
          caption: updated.caption,
          hashtags: updated.hashtags,
          approval: {
            required: updated.approvalRequired,
            status: updated.approvalStatus,
            approved_by: updated.approvedBy ?? null,
            approved_at: updated.approvedAt ?? null,
          },
          publication_results: updated.publishResults,
          error: updated.error,
        });
        const beautiful = beautifyContent({
          id: updated.id,
          title: updated.title,
          status: updated.status,
          approvalStatus: updated.approvalStatus,
          createdAt: updated.updatedAt ?? nowUtcIso(),
          createdBy: updated.createdBy,
          platformTargets: (updated.platformTargets as Array<{ platform: string }>) ?? [],
          description: updated.description,
        });
        const kb = buildContentKeyboard(updated.id, updated.status, updated.approvalStatus);
        // Prefer editing the hidden message if we have metadataMessageId, but still ensure beautiful+hidden dual
        if (existing.metadataMessageId) {
          try {
            await client.editMessageText(existing.metadataMessageId, tgdbText);
            // also send beautiful as new visible message (keeps hidden editable for rebuild)
            const beautiful2 = beautifyContent({
              id: updated.id,
              title: updated.title,
              status: updated.status,
              approvalStatus: updated.approvalStatus,
              createdAt: updated.updatedAt ?? nowUtcIso(),
              createdBy: updated.createdBy,
              platformTargets: (updated.platformTargets as Array<{ platform: string }>) ?? [],
              description: updated.description,
            });
            await client.sendMessage(beautiful2.text, updated.sourceTopicId ?? undefined, {
              parseMode: beautiful2.parseMode as never,
              replyMarkup: kb as never,
            });
          } catch {
            // fallback to dual send
            await sendBeautifulWithHidden(client, tgdbText, beautiful, kb, updated.sourceTopicId ?? undefined);
          }
        } else {
          await sendBeautifulWithHidden(client, tgdbText, beautiful, kb, updated.sourceTopicId ?? undefined);
        }
        await markSyncStatus("ok");
      } catch (err) {
        await markSyncStatus("degraded");
        console.error("[tgdb] failed to update content metadata on Telegram:", (err as Error).message);
      }
    }
  }

  const [row] = await db.update(content).set(updated).where(eq(content.id, id)).returning();
  return row;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export async function appendAuditEvent(input: {
  actorTelegramId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const id = generateEntityId("EVT");
  let telegramMessageId: number | null = null;

  const client = await tryGetClient();
  if (client) {
    try {
      const [logsTopic] = await db.select().from(telegramTopics).where(eq(telegramTopics.key, "logs")).limit(1);
      const tgdbText = buildTgdbMessage("audit_event", {
        id,
        content_id: input.entityId ?? null,
        action: input.action,
        entity_type: input.entityType,
        from: (input.before as { status?: string } | null)?.status ?? null,
        to: (input.after as { status?: string } | null)?.status ?? null,
        user_telegram_id: input.actorTelegramId ?? null,
        created_at: nowUtcIso(),
      });
      const beautiful = beautifyAudit({
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? "",
        from: (input.before as { status?: string } | null)?.status ?? null,
        to: (input.after as { status?: string } | null)?.status ?? null,
      });
      const kb = input.entityId
        ? buildContentKeyboard(
            input.entityId,
            (input.after as { status?: string } | null)?.status ??
              (input.before as { status?: string } | null)?.status ??
              "draft",
            null,
          )
        : undefined;
      const { beautifulMessageId } = await sendBeautifulWithHidden(
        client,
        tgdbText,
        beautiful,
        kb ?? { inline_keyboard: [] },
        logsTopic?.messageThreadId ?? undefined,
      );
      telegramMessageId = beautifulMessageId;
    } catch (err) {
      console.error("[tgdb] failed to write audit event to Telegram:", (err as Error).message);
    }
  }

  await db.insert(auditEvents).values({
    id,
    actorTelegramId: input.actorTelegramId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    telegramMessageId,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Analytics snapshots
// ---------------------------------------------------------------------------
export async function saveAnalyticsSnapshot(input: {
  platform: string;
  accountId: string;
  dateJalali: string;
  dateUtc: string;
  metrics: Record<string, number>;
  rawMetrics: Record<string, unknown>;
}) {
  const id = generateEntityId("SNP");
  let telegramMessageId: number | null = null;

  const client = await tryGetClient();
  if (client) {
    try {
      const [reportsTopic] = await db.select().from(telegramTopics).where(eq(telegramTopics.key, "reports")).limit(1);
      const tgdbText = buildTgdbMessage("analytics_snapshot", {
        id,
        platform: input.platform,
        account_id: input.accountId,
        date_jalali: input.dateJalali,
        date_utc: input.dateUtc,
        ...input.metrics,
      });
      const beautiful = beautifyAnalytics({
        platform: input.platform,
        dateJalali: input.dateJalali,
        dateUtc: input.dateUtc,
        metrics: input.metrics,
        views: input.metrics.views,
      });
      const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
      const kb = {
        inline_keyboard: [[{ text: "🔗 مشاهده در پنل", url: `${base}/analytics` }]],
      };
      const { beautifulMessageId } = await sendBeautifulWithHidden(
        client,
        tgdbText,
        beautiful,
        kb,
        reportsTopic?.messageThreadId ?? undefined,
      );
      telegramMessageId = beautifulMessageId;
    } catch (err) {
      console.error("[tgdb] failed to write analytics snapshot to Telegram:", (err as Error).message);
    }
  }

  await db.insert(analyticsSnapshots).values({
    id,
    platform: input.platform,
    accountId: input.accountId,
    dateJalali: input.dateJalali,
    dateUtc: new Date(input.dateUtc),
    followersOrSubscribers: input.metrics.followersOrSubscribers ?? 0,
    views: input.metrics.views ?? 0,
    reach: input.metrics.reach ?? 0,
    likes: input.metrics.likes ?? 0,
    comments: input.metrics.comments ?? 0,
    shares: input.metrics.shares ?? 0,
    saves: input.metrics.saves ?? 0,
    watchTime: input.metrics.watchTime ?? 0,
    averageViewDuration: String(input.metrics.averageViewDuration ?? 0),
    engagementRate: String(input.metrics.engagementRate ?? 0),
    rawMetrics: input.rawMetrics,
    telegramMessageId,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Notifications (private chat with users who started the bot)
// ---------------------------------------------------------------------------
export async function notifyUser(
  telegramId: string,
  text: string,
  opts?: { parseMode?: string; replyMarkup?: unknown },
) {
  const client = await tryGetClient();
  if (!client) return false;
  try {
    await client.sendPrivateMessage(telegramId, text, {
      parseMode: opts?.parseMode ?? (text.includes("<") ? "HTML" : undefined),
      replyMarkup: opts?.replyMarkup as never,
    });
    return true;
  } catch (err) {
    console.error("[tgdb] failed to notify user:", (err as Error).message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Export / Import — the practical "history rebuild" mechanism.
// ---------------------------------------------------------------------------
// The Telegram Bot API cannot search or paginate arbitrary chat history, so a
// full rebuild directly from Telegram is not possible without a separate
// MTProte "History Adapter" (documented in README, not enabled by default).
// Instead we support exporting the full local index (which always mirrors
// messages that this app itself created) as a portable JSON snapshot, and
// re-importing it — e.g. after restoring the Postgres volume from backup, or
// migrating to a new server. Each exported record still carries its Telegram
// message id/topic id so it always remains traceable to the group.
// ---------------------------------------------------------------------------
export async function exportRecords() {
  const [contentRows, auditRows, analyticsRows, accountRows, topicRows, settingsRows] = await Promise.all([
    db.select().from(content),
    db.select().from(auditEvents),
    db.select().from(analyticsSnapshots),
    db.select().from(socialAccounts),
    db.select().from(telegramTopics),
    db.select().from(appSettings),
  ]);
  return {
    exportedAt: nowUtcIso(),
    version: 1,
    content: contentRows,
    auditEvents: auditRows,
    analyticsSnapshots: analyticsRows,
    socialAccounts: accountRows,
    telegramTopics: topicRows,
    appSettings: settingsRows,
  };
}

export async function importRecords(payload: {
  content?: (typeof content.$inferInsert)[];
  auditEvents?: (typeof auditEvents.$inferInsert)[];
  analyticsSnapshots?: (typeof analyticsSnapshots.$inferInsert)[];
  socialAccounts?: (typeof socialAccounts.$inferInsert)[];
  telegramTopics?: (typeof telegramTopics.$inferInsert)[];
}) {
  let imported = 0;
  if (payload.telegramTopics) {
    for (const row of payload.telegramTopics) {
      await db.insert(telegramTopics).values(row).onConflictDoUpdate({ target: telegramTopics.id, set: row });
      imported++;
    }
  }
  if (payload.socialAccounts) {
    for (const row of payload.socialAccounts) {
      await db.insert(socialAccounts).values(row).onConflictDoUpdate({ target: socialAccounts.id, set: row });
      imported++;
    }
  }
  if (payload.content) {
    for (const row of payload.content) {
      await db.insert(content).values(row).onConflictDoUpdate({ target: content.id, set: row });
      imported++;
    }
  }
  if (payload.auditEvents) {
    for (const row of payload.auditEvents) {
      await db.insert(auditEvents).values(row).onConflictDoNothing();
      imported++;
    }
  }
  if (payload.analyticsSnapshots) {
    for (const row of payload.analyticsSnapshots) {
      await db.insert(analyticsSnapshots).values(row).onConflictDoNothing();
      imported++;
    }
  }
  return imported;
}

/**
 * Best-effort local index rebuild: re-validates connectivity, recomputes the
 * settings sync status, and returns basic integrity stats (orphan media,
 * missing metadata links) so an operator can decide whether a manual
 * export/import from a backup is needed. See README "Rebuild Index" guide.
 */
export async function rebuildIndex() {
  const client = await tryGetClient();
  let connected = false;
  if (client) {
    try {
      await client.getChat();
      connected = true;
      await markSyncStatus("ok");
    } catch {
      await markSyncStatus("degraded");
    }
  } else {
    await markSyncStatus("offline");
  }

  const rows = await db.select().from(content);
  const missingMedia = rows.filter((r) => !r.media || (r.media as unknown[]).length === 0).map((r) => r.id);
  const missingMetadataMessage = rows.filter((r) => !r.metadataMessageId).map((r) => r.id);

  await db
    .insert(appSettings)
    .values({ id: 1, lastIndexRebuildAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { lastIndexRebuildAt: new Date(), updatedAt: new Date() },
    });

  return {
    connected,
    totalContent: rows.length,
    missingMedia,
    missingMetadataMessage,
  };
}

export { TelegramNotConfiguredError };
