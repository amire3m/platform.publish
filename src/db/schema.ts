// -----------------------------------------------------------------------------
// YouTube EmRo — Local Index Schema
// -----------------------------------------------------------------------------
// IMPORTANT ARCHITECTURE NOTE
// -----------------------------------------------------------------------------
// Per product requirements, the *private Telegram supergroup* is the system of
// record for legacy business content, metadata, users, audit trail and analytics
// snapshots. Those legacy tables are a REBUILDABLE LOCAL INDEX/CACHE that mirrors
// structured "TGDB|v1" messages that live in Telegram topics. Nothing here is
// treated as the ultimate source of truth for content data — it exists only to
// make search, calendars and the publish worker fast. The `telegramMessageIds`
// / `telegramMessageId` columns are what tie every row back to the Telegram
// message that actually owns the data, and `rebuildIndex()` (see
// src/lib/telegram/tgdb.ts) can regenerate these tables from Telegram exports.
//
// The only things that must NEVER be written to Telegram are secrets: OAuth
// tokens, client secrets and passwords. Those live exclusively in the
// `credentials` table, encrypted at rest (see src/lib/crypto.ts), referenced
// elsewhere only through an opaque `credentialRef` id.
// -----------------------------------------------------------------------------

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Users & access control
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  name: text("name").notNull(),
  username: text("username"),
  phone: text("phone"),
  role: text("role").notNull().default("viewer"), // owner|manager|editor|publisher|analyst|viewer
  active: boolean("active").notNull().default(true),
  allowedAccountIds: jsonb("allowed_account_ids").$type<string[]>().notNull().default([]),
  allowedActions: jsonb("allowed_actions").$type<string[]>().notNull().default([]),
  allowedChannels: jsonb("allowed_channels").$type<string[]>().notNull().default([]),
  avatarUrl: text("avatar_url"),
  isOwnerProtected: boolean("is_owner_protected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Telegram fixed topic map (⚙️ settings, 👥 users, 📥 inbox, ✅ published, ...)
// ---------------------------------------------------------------------------
export const telegramTopics = pgTable("telegram_topics", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(), // stable machine key e.g. "errors"
  label: text("label").notNull(), // human display name, editable
  messageThreadId: integer("message_thread_id"), // real Telegram topic id
  purpose: text("purpose").notNull(), // description of what is stored here
  isFixed: boolean("is_fixed").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Encrypted credential vault (never mirrored to Telegram)
// ---------------------------------------------------------------------------
export const credentials = pgTable("credentials", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(), // youtube|instagram
  label: text("label").notNull(),
  encryptedPayload: text("encrypted_payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Social accounts (YouTube channels / Instagram business accounts)
// ---------------------------------------------------------------------------
export const socialAccounts = pgTable("social_accounts", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(), // youtube|instagram
  externalAccountId: text("external_account_id"),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  organization: text("organization").$type<"emro" | "sana" | null>(),
  profileImage: text("profile_image"),
  topicId: text("topic_id"), // FK-ish reference into telegram_topics.id (per-account queue topic)
  topicMessageThreadId: integer("topic_message_thread_id"),
  topicLabel: text("topic_label"),
  active: boolean("active").notNull().default(true),
  capabilities: jsonb("capabilities").$type<Record<string, unknown>>().notNull().default({}),
  credentialRef: text("credential_ref"),
  connectionStatus: text("connection_status").notNull().default("disconnected"), // disconnected|mock|connected|error
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  analyticsSyncLockedAt: timestamp("analytics_sync_locked_at", { withTimezone: true }),
  analyticsSyncLockId: text("analytics_sync_lock_id"),
  analyticsSyncedThrough: timestamp("analytics_synced_through", { withTimezone: true }),
  analyticsLastErrorCode: text("analytics_last_error_code"),
  analyticsNextAttemptAt: timestamp("analytics_next_attempt_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Content (mirrors the TGDB|v1 "content" entity JSON payload)
// ---------------------------------------------------------------------------
export const content = pgTable(
  "content",
  {
    id: text("id").primaryKey(), // CNT-1405-000001
    version: integer("version").notNull().default(1),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    caption: text("caption").notNull().default(""),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    media: jsonb("media").$type<Record<string, unknown>[]>().notNull().default([]),
    platformTargets: jsonb("platform_targets").$type<Record<string, unknown>[]>().notNull().default([]),
    status: text("status").notNull().default("draft"),
    approvalRequired: boolean("approval_required").notNull().default(true),
    approvalStatus: text("approval_status").notNull().default("pending"), // pending|approved|changes_requested|rejected
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    scheduledAtJalali: text("scheduled_at_jalali"),
    scheduledAtUtc: timestamp("scheduled_at_utc", { withTimezone: true }),
    timezone: text("timezone").notNull().default("Asia/Tehran"),
    sourceTopicId: integer("source_topic_id"),
    metadataMessageId: integer("metadata_message_id"),
    captionMessageId: integer("caption_message_id"),
    thumbnailMessageId: integer("thumbnail_message_id"),
    telegramMessageIds: jsonb("telegram_message_ids").$type<Record<string, unknown>>().notNull().default({}),
    publishResults: jsonb("publish_results").$type<Record<string, unknown>[]>().notNull().default([]),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    error: jsonb("error").$type<Record<string, unknown> | null>(),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("content_status_idx").on(table.status),
    scheduleIdx: index("content_schedule_idx").on(table.scheduledAtUtc),
  }),
);

// ---------------------------------------------------------------------------
// Audit events (mirrors TGDB|v1 "audit_event" entity)
// ---------------------------------------------------------------------------
export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(), // EVT-1405-000042
  actorTelegramId: text("actor_telegram_id"),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  telegramMessageId: integer("telegram_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Analytics snapshots (mirrors TGDB|v1 "analytics_snapshot" entity)
// ---------------------------------------------------------------------------
export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(),
    accountId: text("account_id").notNull(),
    scopeType: text("scope_type").notNull().default("account"),
    scopeId: text("scope_id").notNull().default(""),
    contentTitle: text("content_title"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    dateJalali: text("date_jalali").notNull(),
    dateUtc: timestamp("date_utc", { withTimezone: true }).notNull(),
    followersOrSubscribers: bigint("followers_or_subscribers", { mode: "number" }).default(0),
    subscribersGained: bigint("subscribers_gained", { mode: "number" }).default(0),
    subscribersLost: bigint("subscribers_lost", { mode: "number" }).default(0),
    views: bigint("views", { mode: "number" }).default(0),
    reach: bigint("reach", { mode: "number" }).default(0),
    likes: bigint("likes", { mode: "number" }).default(0),
    comments: bigint("comments", { mode: "number" }).default(0),
    shares: bigint("shares", { mode: "number" }).default(0),
    saves: bigint("saves", { mode: "number" }).default(0),
    watchTime: bigint("watch_time", { mode: "number" }).default(0),
    averageViewDuration: numeric("average_view_duration").default("0"),
    engagementRate: numeric("engagement_rate").default("0"),
    impressions: integer("impressions"),
    ctr: doublePrecision("ctr"),
    estimatedRevenue: numeric("estimated_revenue"),
    cpm: numeric("cpm"),
    rawMetrics: jsonb("raw_metrics").$type<Record<string, unknown>>().notNull().default({}),
    telegramMessageId: integer("telegram_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dailyScopeUnique: uniqueIndex("analytics_snapshot_daily_scope_unique").on(
      table.platform,
      table.accountId,
      table.scopeType,
      table.scopeId,
      table.dateUtc,
    ),
    dimensionIdx: index("analytics_snapshots_dimension_idx").on(table.accountId, table.scopeType, table.dateUtc),
  }),
);

// ---------------------------------------------------------------------------
// Application settings (singleton). Only NON-secret configuration lives here;
// bot tokens / OAuth client secrets always come from environment variables.
// ---------------------------------------------------------------------------
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  telegramGroupId: text("telegram_group_id"),
  telegramGroupTitle: text("telegram_group_title"),
  botUsername: text("bot_username"),
  ownerTelegramId: text("owner_telegram_id"),
  botPrivacyMode: text("bot_privacy_mode").default("unknown"),
  fileSizeLimitMb: integer("file_size_limit_mb").notNull().default(50),
  topicsConfigured: boolean("topics_configured").notNull().default(false),
  defaultTimezone: text("default_timezone").notNull().default("Asia/Tehran"),
  capabilityConfig: jsonb("capability_config").$type<Record<string, unknown>>().notNull().default({}),
  lastIndexRebuildAt: timestamp("last_index_rebuild_at", { withTimezone: true }),
  lastAnalyticsRunAt: timestamp("last_analytics_run_at", { withTimezone: true }),
  syncStatus: text("sync_status").notNull().default("unknown"), // ok|degraded|offline|unknown
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Content workflow (PostgreSQL-authoritative; not rebuilt from Telegram)
// ---------------------------------------------------------------------------
export const workflowPrograms = pgTable(
  "workflow_programs",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    seriesName: text("series_name"),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    notes: text("notes"),
    source: text("source").notNull().default("manual"),
    sourceRef: text("source_ref"),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    ownerIdx: index("workflow_program_owner_idx").on(table.ownerUserId),
    dueIdx: index("workflow_program_due_idx").on(table.dueAt),
    archivedIdx: index("workflow_program_archived_idx").on(table.archivedAt),
  }),
);

export const workflowDeliverables = pgTable(
  "workflow_deliverables",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => workflowPrograms.id),
    name: text("name").notNull(),
    kind: text("kind"),
    sortOrder: integer("sort_order").notNull().default(0),
    productionStatus: text("production_status")
      .notNull()
      .default("not_started"),
    assigneeUserId: text("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    notes: text("notes"),
    contentId: text("content_id").references(() => content.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    programIdx: index("workflow_deliverable_program_idx").on(table.programId),
    assigneeIdx: index("workflow_deliverable_assignee_idx").on(
      table.assigneeUserId,
    ),
    statusIdx: index("workflow_deliverable_status_idx").on(
      table.productionStatus,
    ),
    dueIdx: index("workflow_deliverable_due_idx").on(table.dueAt),
    contentUnique: uniqueIndex("workflow_deliverable_content_unique").on(
      table.contentId,
    ),
  }),
);

export const workflowPublications = pgTable(
  "workflow_publications",
  {
    id: text("id").primaryKey(),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => workflowDeliverables.id),
    platform: text("platform").notNull(),
    socialAccountId: text("social_account_id").references(
      () => socialAccounts.id,
    ),
    status: text("status").notNull().default("waiting_for_production"),
    createdSource: text("created_source").notNull().default("manual"),
    terminalOwner: text("terminal_owner"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    externalId: text("external_id"),
    permalink: text("permalink"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    manualReason: text("manual_reason"),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    deliverableIdx: index("workflow_publication_deliverable_idx").on(
      table.deliverableId,
    ),
    statusIdx: index("workflow_publication_status_idx").on(table.status),
    scheduleIdx: index("workflow_publication_schedule_idx").on(
      table.scheduledAt,
    ),
    accountUnique: uniqueIndex("workflow_publication_account_unique").on(
      table.deliverableId,
      table.platform,
      table.socialAccountId,
    ),
    accountlessUnique: uniqueIndex(
      "workflow_publication_accountless_unique",
    )
      .on(table.deliverableId, table.platform)
      .where(sql`${table.socialAccountId} is null`),
  }),
);

export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    activeIdx: index("workflow_template_active_idx").on(table.active),
  }),
);

export const workflowTemplateItems = pgTable(
  "workflow_template_items",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => workflowTemplates.id),
    name: text("name").notNull(),
    kind: text("kind"),
    sortOrder: integer("sort_order").notNull().default(0),
    destinations: jsonb("destinations")
      .$type<Array<{ platform: "telegram" | "youtube" | "instagram" }>>()
      .notNull()
      .default([]),
    dueOffsetMinutes: integer("due_offset_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    templateIdx: index("workflow_template_item_template_idx").on(
      table.templateId,
      table.sortOrder,
    ),
  }),
);

export const workflowEvents = pgTable(
  "workflow_events",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    entityIdx: index("workflow_event_entity_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  }),
);

export const workflowNotifications = pgTable(
  "workflow_notifications",
  {
    id: text("id").primaryKey(),
    recipientUserId: text("recipient_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    claimId: text("claim_id"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex(
      "workflow_notification_idempotency_unique",
    ).on(table.idempotencyKey),
    deliveryIdx: index("workflow_notification_delivery_idx").on(
      table.status,
      table.scheduledAt,
    ),
    recipientIdx: index("workflow_notification_recipient_idx").on(
      table.recipientUserId,
      table.readAt,
    ),
  }),
);

export const workflowImportBatches = pgTable(
  "workflow_import_batches",
  {
    id: text("id").primaryKey(),
    sheetId: text("sheet_id").notNull(),
    sheetGid: text("sheet_gid"),
    initiatorUserId: text("initiator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    mapping: jsonb("mapping").$type<Record<string, unknown>>().notNull(),
    counts: jsonb("counts").$type<Record<string, number>>().notNull(),
    results: jsonb("results")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusIdx: index("workflow_import_batch_status_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);

export const workflowImportPreviews = pgTable(
  "workflow_import_previews",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    csvSnapshot: text("csv_snapshot").notNull(),
    csvHash: text("csv_hash").notNull(),
    mapping: jsonb("mapping").$type<Record<string, unknown>>().notNull(),
    decisions: jsonb("decisions").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => ({
    expiryIdx: index("workflow_import_preview_expiry_idx").on(table.expiresAt),
  }),
);

// ---------------------------------------------------------------------------
// Content Room (intake → publication room) — PostgreSQL-authoritative
// ---------------------------------------------------------------------------
export const contentProducts = pgTable(
  "content_products",
  {
    id: text("id").primaryKey(), // CPR-1405-000001
    title: varchar("title", { length: 200 }).notNull(),
    productType: text("product_type").notNull(), // serial | documentary | tv_program | film | short_film | educational
    channel: text("channel").notNull(), // zed_revayat | zaviye_no | tamashin | iranian_frame | shock | tinazh
    partsCount: integer("parts_count").notNull(),
    status: text("status").notNull().default("imported"), // imported | editing_youtube | copyright_fix | highlight_done | reel_done | cover_ready | ready_to_send
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    productTypeIdx: index("content_product_type_idx").on(table.productType),
    channelIdx: index("content_product_channel_idx").on(table.channel),
    statusIdx: index("content_product_status_idx").on(table.status),
    archivedIdx: index("content_product_archived_idx").on(table.archivedAt),
  }),
);

export const contentParts = pgTable(
  "content_parts",
  {
    id: text("id").primaryKey(), // CPP-1405-000001
    productId: text("product_id")
      .notNull()
      .references(() => contentProducts.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    fileRef: text("file_ref"),
    coverFileRef: text("cover_file_ref"),
    version: integer("version").notNull().default(1),
    status: text("status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    productIdx: index("content_part_product_idx").on(table.productId),
    productPartUnique: uniqueIndex("content_part_product_part_unique").on(table.productId, table.partNumber),
  }),
);
