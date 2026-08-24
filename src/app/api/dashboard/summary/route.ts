import { jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";
import { CHANNELS, CONTENT_STATUSES, PRODUCT_TYPES } from "@/lib/content-room/repository";
import { deriveProgramProgress } from "@/lib/workflow/progress";
import type { ProductionStatus, PublicationStatus } from "@/lib/workflow/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ContentProductSummary {
  id: string;
  title: string;
  productType: string;
  channel: string;
  status: string;
  dueAt: Date | string | null;
  createdBy: string | null;
}

export interface WorkflowProgramSummary {
  id: string;
}

export interface WorkflowDeliverableSummary {
  id: string;
  programId: string;
  productionStatus: string;
  assigneeUserId: string | null;
  dueAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string | null;
  archivedAt?: Date | string | null;
}

export interface WorkflowPublicationSummary {
  id: string;
  deliverableId: string;
  platform: string;
  status: string;
  createdAt?: Date | string;
  updatedAt?: Date | string | null;
  scheduledAt?: Date | string | null;
}

export interface UserSummary {
  id: string;
  name?: string | null;
}

export interface YoutubeChannelViews {
  channelId: string;
  label: string;
  views: number;
}

export interface YoutubeTopVideo {
  videoId: string;
  title: string;
  views: number;
  channel: string;
  channelId?: string;
}

export interface YoutubeSummary {
  totalViews30d: number;
  byChannel: YoutubeChannelViews[];
  topVideos: YoutubeTopVideo[];
}

export interface InstagramSummary {
  status: "awaiting_connection" | "connected";
  byPage: Array<{ pageId: string; label: string; views: number }>;
  connectedCount: number;
}

export interface DashboardSummaryDependencies {
  requireDashboardAccess: () => Promise<{ user: unknown | null; response: Response | null }>;
  fetchContentProducts: () => Promise<ContentProductSummary[]>;
  fetchPrograms: () => Promise<WorkflowProgramSummary[]>;
  fetchDeliverables: () => Promise<WorkflowDeliverableSummary[]>;
  fetchPublications: () => Promise<WorkflowPublicationSummary[]>;
  fetchUsers: () => Promise<UserSummary[]>;
  fetchMailUnread: (account: "info" | "support") => Promise<number>;
  fetchYoutubeSummary?: (now: Date) => Promise<YoutubeSummary>;
  fetchInstagramSummary?: () => Promise<InstagramSummary>;
  now: () => Date;
}

// ---------------------------------------------------------------------------
// Default permission check: view_dashboard OR (view_content_room + view_workflow)
// ---------------------------------------------------------------------------
async function defaultRequireDashboardAccess(): Promise<{ user: unknown | null; response: Response | null }> {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") };
  }
  const subject = {
    role: user.role,
    allowedActions: user.allowedActions,
    allowedAccountIds: user.allowedAccountIds,
  };
  if (hasPermission(subject, "view_dashboard" as Permission)) {
    return { user, response: null };
  }
  if (
    hasPermission(subject, "view_content_room" as Permission) &&
    hasPermission(subject, "view_workflow" as Permission)
  ) {
    return { user, response: null };
  }
  return { user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") };
}

// ---------------------------------------------------------------------------
// Default fetchers (read-only, no transaction) via drizzle
// ---------------------------------------------------------------------------
async function defaultFetchContentProducts(): Promise<ContentProductSummary[]> {
  const { db } = await import("@/db");
  const { contentProducts } = await import("@/db/schema");
  const rows = await db.select().from(contentProducts);
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    title: (r.title as string) ?? "",
    productType: ((r.productType as string) ?? (r.product_type as string) ?? "") as string,
    channel: (r.channel as string) ?? "",
    status: (r.status as string) ?? "imported",
    dueAt: ((r.dueAt as Date | null) ?? (r.due_at as Date | null) ?? null) as Date | null,
    createdBy: ((r.createdBy as string | null) ?? (r.created_by as string | null) ?? null) as string | null,
  }));
}

async function defaultFetchPrograms(): Promise<WorkflowProgramSummary[]> {
  const { db } = await import("@/db");
  const { workflowPrograms } = await import("@/db/schema");
  const rows = await db.select().from(workflowPrograms);
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
  }));
}

async function defaultFetchDeliverables(): Promise<WorkflowDeliverableSummary[]> {
  const { db } = await import("@/db");
  const { workflowDeliverables } = await import("@/db/schema");
  const rows = await db.select().from(workflowDeliverables);
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    programId: ((r.programId as string) ?? (r.program_id as string)) as string,
    productionStatus: ((r.productionStatus as string) ?? (r.production_status as string) ?? "not_started") as string,
    assigneeUserId: ((r.assigneeUserId as string | null) ?? (r.assignee_user_id as string | null) ?? null) as string | null,
    dueAt: ((r.dueAt as Date | null) ?? (r.due_at as Date | null) ?? null) as Date | null,
    createdAt: ((r.createdAt as Date) ?? (r.created_at as Date)) as Date,
    updatedAt: ((r.updatedAt as Date) ?? (r.updated_at as Date) ?? null) as Date | null,
    archivedAt: ((r.archivedAt as Date | null) ?? (r.archived_at as Date | null) ?? null) as Date | null,
  }));
}

async function defaultFetchPublications(): Promise<WorkflowPublicationSummary[]> {
  const { db } = await import("@/db");
  const { workflowPublications } = await import("@/db/schema");
  const rows = await db.select().from(workflowPublications);
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    deliverableId: ((r.deliverableId as string) ?? (r.deliverable_id as string)) as string,
    platform: (r.platform as string) ?? "telegram",
    status: (r.status as string) ?? "waiting_for_production",
    createdAt: ((r.createdAt as Date) ?? (r.created_at as Date)) as Date,
    updatedAt: ((r.updatedAt as Date) ?? (r.updated_at as Date) ?? null) as Date | null,
    scheduledAt: ((r.scheduledAt as Date | null) ?? (r.scheduled_at as Date | null) ?? null) as Date | null,
  }));
}

async function defaultFetchUsers(): Promise<UserSummary[]> {
  const { db } = await import("@/db");
  const { users } = await import("@/db/schema");
  const rows = await db.select({ id: users.id, name: users.name }).from(users);
  return rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }));
}

async function defaultFetchMailUnread(_account: "info" | "support"): Promise<number> {
  // TODO: IMAP unread count via ImapFlow or Maildir /var/mail/vhosts check.
  // For now return 0; stub keeps API read-only and avoids IMAP credentials requirement.
  // Future: use fetchMessages or IMAP SEARCH UNSEEN, cache for 60s to avoid rate-limit.
  return 0;
}

async function defaultFetchYoutubeSummary(now: Date): Promise<YoutubeSummary> {
  try {
    const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Prefer analytics repository (unifies youtube_analytics_snapshots / analytics_snapshots)
    const { analyticsRepository } = await import("@/lib/analytics/repository");
    const { listMainReportAccountIds } = await import("@/lib/accounts/organization-server");
    const { MAIN_REPORT_ALIAS } = await import("@/lib/accounts/organization");
    const accountIds = await listMainReportAccountIds("youtube");
    if (accountIds.length === 0) return { totalViews30d: 0, byChannel: [], topVideos: [] };
    const rows = await analyticsRepository.readSnapshots({
      startDateInclusive: windowStart,
      endDateExclusive: now,
      accountIds,
    });
    if (!rows || rows.length === 0) {
      // fallback: direct drizzle query if repository empty (e.g. no join metadata)
      return { totalViews30d: 0, byChannel: [], topVideos: [] };
    }
    const accountRows = rows.filter((r) => (r as unknown as { scopeType: string }).scopeType === "account");
    const contentRows = rows.filter((r) => (r as unknown as { scopeType: string }).scopeType === "content");

    let byChannelMap = new Map<string, { label: string; views: number }>();
    let total = 0;

    if (accountRows.length > 0) {
      for (const r of accountRows as unknown as Array<{ accountId: string; channelId: string; channelTitle: string; views: number }>) {
        const channelId = (r.channelId ?? r.accountId) as string;
        const label = (r.channelTitle ?? channelId) as string;
        const v = Number((r as unknown as { views: number }).views ?? 0);
        total += v;
        const existing = byChannelMap.get(channelId) ?? { label, views: 0 };
        // keep first label if conflict
        existing.views += v;
        byChannelMap.set(channelId, existing);
      }
    } else if (contentRows.length > 0) {
      for (const r of contentRows as unknown as Array<{ accountId: string; channelId: string; channelTitle: string; views: number }>) {
        const channelId = (r.channelId ?? r.accountId) as string;
        const label = (r.channelTitle ?? channelId) as string;
        const v = Number((r as unknown as { views: number }).views ?? 0);
        total += v;
        const existing = byChannelMap.get(channelId) ?? { label, views: 0 };
        existing.views += v;
        byChannelMap.set(channelId, existing);
      }
    }

    if (total === 0 && rows.length > 0) {
      for (const r of rows as unknown as Array<{ views: number }>) total += Number(r.views ?? 0);
      if (byChannelMap.size === 0) {
        const fallback = new Map<string, { label: string; views: number }>();
        for (const r of rows as unknown as Array<{ accountId: string; channelId: string; channelTitle: string; views: number }>) {
          const cid = (r.channelId ?? r.accountId) as string;
          const lab = (r.channelTitle ?? cid) as string;
          const v = Number(r.views ?? 0);
          const e = fallback.get(cid) ?? { label: lab, views: 0 };
          e.views += v;
          fallback.set(cid, e);
        }
        byChannelMap = fallback;
      }
    }

    const byChannel: YoutubeChannelViews[] = total > 0
      ? [{ channelId: "emro", label: MAIN_REPORT_ALIAS, views: total }]
      : [];

    const videoMap = new Map<string, { title: string; channel: string; channelId: string; views: number }>();
    for (const r of contentRows as unknown as Array<{ videoId: string; scopeId: string; title: string; contentTitle: string | null; channelTitle: string; channelId: string; accountId: string; views: number }>) {
      const vid = (r.videoId ?? r.scopeId) as string;
      if (!vid) continue;
      const title = (r.title ?? r.contentTitle ?? vid) as string;
      const channel = MAIN_REPORT_ALIAS;
      const channelId = "emro";
      const v = Number(r.views ?? 0);
      const existing = videoMap.get(vid);
      if (existing) existing.views += v;
      else videoMap.set(vid, { title, channel, channelId, views: v });
    }

    const topVideos: YoutubeTopVideo[] = [...videoMap.entries()]
      .map(([videoId, val]) => ({ videoId, ...val }))
      .sort((a, b) => b.views - a.views || a.videoId.localeCompare(b.videoId))
      .slice(0, 5);

    return { totalViews30d: total, byChannel, topVideos };
  } catch {
    return { totalViews30d: 0, byChannel: [], topVideos: [] };
  }
}

async function defaultFetchInstagramSummary(): Promise<InstagramSummary> {
  try {
    const { db } = await import("@/db");
    const { socialAccounts } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { MAIN_REPORT_ALIAS, MAIN_REPORT_ORGANIZATION } = await import("@/lib/accounts/organization");
    const rows = await db
      .select({ id: socialAccounts.id, displayName: socialAccounts.displayName })
      .from(socialAccounts)
      .where(and(
        eq(socialAccounts.platform, "instagram"),
        eq(socialAccounts.organization, MAIN_REPORT_ORGANIZATION),
        eq(socialAccounts.connectionStatus, "connected"),
      ));
    const connectedCount = rows.length;
    if (connectedCount === 0) {
      return { status: "awaiting_connection", byPage: [], connectedCount: 0 };
    }
    // Instagram analytics not yet available — placeholder with per-page 0 views
    return {
      status: "connected",
      byPage: [{ pageId: "emro", label: MAIN_REPORT_ALIAS, views: 0 }],
      connectedCount,
    };
  } catch {
    return { status: "awaiting_connection", byPage: [], connectedCount: 0 };
  }
}

const defaultDependencies: DashboardSummaryDependencies = {
  requireDashboardAccess: defaultRequireDashboardAccess,
  fetchContentProducts: defaultFetchContentProducts,
  fetchPrograms: defaultFetchPrograms,
  fetchDeliverables: defaultFetchDeliverables,
  fetchPublications: defaultFetchPublications,
  fetchUsers: defaultFetchUsers,
  fetchMailUnread: defaultFetchMailUnread,
  fetchYoutubeSummary: defaultFetchYoutubeSummary,
  fetchInstagramSummary: defaultFetchInstagramSummary,
  now: () => new Date(),
};

// ---------------------------------------------------------------------------
// Core aggregation (pure, testable)
// ---------------------------------------------------------------------------
export async function handleDashboardSummaryRequest(
  _request: Request,
  deps: DashboardSummaryDependencies = defaultDependencies,
): Promise<Response> {
  const { user, response } = await deps.requireDashboardAccess();
  if (!user) return response!;

  const now = deps.now();
  const nowTime = now.getTime();

  const youtubePromise = deps.fetchYoutubeSummary
    ? deps.fetchYoutubeSummary(now).catch(() => ({ totalViews30d: 0, byChannel: [], topVideos: [] }) as YoutubeSummary)
    : Promise.resolve({ totalViews30d: 0, byChannel: [], topVideos: [] } as YoutubeSummary);
  const instagramPromise = deps.fetchInstagramSummary
    ? deps.fetchInstagramSummary().catch(() => ({ status: "awaiting_connection", byPage: [], connectedCount: 0 }) as InstagramSummary)
    : Promise.resolve({ status: "awaiting_connection", byPage: [], connectedCount: 0 } as InstagramSummary);

  const [products, programs, deliverables, publications, users, mailInfo, mailSupport, youtube, instagram] = await Promise.all([
    deps.fetchContentProducts(),
    deps.fetchPrograms(),
    deps.fetchDeliverables(),
    deps.fetchPublications(),
    deps.fetchUsers(),
    deps.fetchMailUnread("info"),
    deps.fetchMailUnread("support"),
    youtubePromise,
    instagramPromise,
  ]);

  // --- content_products aggregates ---
  const totalProducts = products.length;

  const byStatus: Record<string, number> = {};
  for (const s of CONTENT_STATUSES) byStatus[s] = 0;
  const byProductType: Record<string, number> = {};
  for (const t of PRODUCT_TYPES) byProductType[t] = 0;
  const byChannel: Record<string, number> = {};
  for (const c of CHANNELS) byChannel[c] = 0;

  let overdueCount = 0;
  const overdueProducts: Array<{ id: string; title: string; dueAt: string | null; status: string }> = [];

  for (const p of products) {
    if (p.status in byStatus) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    else byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;

    if (p.productType in byProductType) byProductType[p.productType] = (byProductType[p.productType] ?? 0) + 1;
    else byProductType[p.productType] = (byProductType[p.productType] ?? 0) + 1;

    if (p.channel in byChannel) byChannel[p.channel] = (byChannel[p.channel] ?? 0) + 1;
    else byChannel[p.channel] = (byChannel[p.channel] ?? 0) + 1;

    if (p.dueAt) {
      const dueTime = p.dueAt instanceof Date ? p.dueAt.getTime() : new Date(p.dueAt as string).getTime();
      if (Number.isFinite(dueTime) && dueTime < nowTime && p.status !== "ready_to_send") {
        overdueCount += 1;
        overdueProducts.push({
          id: p.id,
          title: p.title,
          status: p.status,
          dueAt: p.dueAt instanceof Date ? p.dueAt.toISOString() : (p.dueAt as string),
        });
      }
    }
  }

  // --- workflow aggregates ---
  const programsCount = programs.length;

  const deliverablesByStatus: Record<string, number> = {};
  const deliverableStatusKeys: string[] = ["not_started", "in_progress", "ready_for_review", "changes_requested", "ready", "cancelled"];
  for (const k of deliverableStatusKeys) deliverablesByStatus[k] = 0;
  for (const d of deliverables) {
    const s = d.productionStatus ?? "not_started";
    deliverablesByStatus[s] = (deliverablesByStatus[s] ?? 0) + 1;
  }

  const publicationsByStatus: Record<string, number> = {};
  const pubStatusKeys = ["waiting_for_production", "ready", "scheduled", "publishing", "published", "failed", "do_not_publish"];
  for (const k of pubStatusKeys) publicationsByStatus[k] = 0;
  for (const p of publications) {
    const s = p.status ?? "waiting_for_production";
    publicationsByStatus[s] = (publicationsByStatus[s] ?? 0) + 1;
  }

  const failedPublications = publications.filter((p) => p.status === "failed");
  const publicationsFailedCount = failedPublications.length;

  // --- progress via existing helper (global aggregation) ---
  // Build WorkflowProgressDeliverable array for deriveProgramProgress
  const pubsByDeliverable = new Map<string, WorkflowPublicationSummary[]>();
  for (const pub of publications) {
    const arr = pubsByDeliverable.get(pub.deliverableId) ?? [];
    arr.push(pub);
    pubsByDeliverable.set(pub.deliverableId, arr);
  }

  const progressInput = deliverables.map((d) => ({
    id: d.id,
    status: (d.productionStatus as ProductionStatus) ?? "not_started",
    createdAt: (d.createdAt as Date) ?? now,
    statusChangedAt: (d.updatedAt as Date | null) ?? (d.createdAt as Date) ?? now,
    dueAt: (d.dueAt as Date | null) ?? null,
    archivedAt: (d.archivedAt as Date | null) ?? null,
    publications: (pubsByDeliverable.get(d.id) ?? []).map((p) => ({
      id: p.id,
      status: (p.status as PublicationStatus) ?? "waiting_for_production",
      createdAt: (p.createdAt as Date) ?? now,
      statusChangedAt: (p.updatedAt as Date | null) ?? (p.createdAt as Date) ?? now,
      scheduledAt: (p.scheduledAt as Date | null) ?? null,
    })),
  }));

  let progress: ReturnType<typeof deriveProgramProgress> | null = null;
  try {
    progress = deriveProgramProgress(progressInput);
  } catch {
    // fallback to simple counts
    progress = null;
  }

  // simple workflow KPIs if progress null
  const totalDeliverables = deliverables.length;
  const totalPublications = publications.length;

  // --- team workload ---
  // per user assigned content count (createdBy) and deliverable count (assignee)
  const userMap = new Map<string, { id: string; name: string | null }>();
  for (const u of users) userMap.set(u.id, { id: u.id, name: u.name ?? null });

  const contentCountByUser = new Map<string, number>();
  for (const p of products) {
    if (!p.createdBy) continue;
    contentCountByUser.set(p.createdBy, (contentCountByUser.get(p.createdBy) ?? 0) + 1);
  }
  const deliverableCountByUser = new Map<string, number>();
  for (const d of deliverables) {
    if (!d.assigneeUserId) continue;
    deliverableCountByUser.set(d.assigneeUserId, (deliverableCountByUser.get(d.assigneeUserId) ?? 0) + 1);
  }
  // overdue per user: content overdue (by createdBy) + deliverable overdue (by assignee)
  const overdueCountByUser = new Map<string, number>();
  for (const p of overdueProducts) {
    const creator = products.find((prod) => prod.id === p.id)?.createdBy;
    if (!creator) continue;
    overdueCountByUser.set(creator, (overdueCountByUser.get(creator) ?? 0) + 1);
  }
  for (const d of deliverables) {
    if (!d.assigneeUserId || !d.dueAt) continue;
    const dueTime = d.dueAt instanceof Date ? d.dueAt.getTime() : new Date(d.dueAt as string).getTime();
    if (!Number.isFinite(dueTime) || dueTime >= nowTime) continue;
    if (d.productionStatus === "ready" || d.productionStatus === "cancelled") continue;
    if (d.archivedAt) continue;
    overdueCountByUser.set(d.assigneeUserId, (overdueCountByUser.get(d.assigneeUserId) ?? 0) + 1);
  }

  // union of user ids that have workload or exist as users
  const workloadUserIds = new Set<string>([
    ...contentCountByUser.keys(),
    ...deliverableCountByUser.keys(),
    ...overdueCountByUser.keys(),
  ]);

  // Also include all known users with zero workload for completeness? Only workload>0 to keep attention focused.
  // Include users with zero as well if they exist? Spec says per user assigned content count and deliverable count -> likely all users.
  // We will return all users with counts (including zeros) plus any orphan ids.
  const allUserIds = new Set<string>([...userMap.keys(), ...workloadUserIds]);

  const teamWorkload = [...allUserIds]
    .map((uid) => ({
      userId: uid,
      name: userMap.get(uid)?.name ?? null,
      assignedContents: contentCountByUser.get(uid) ?? 0,
      assignedDeliverables: deliverableCountByUser.get(uid) ?? 0,
      overdue: overdueCountByUser.get(uid) ?? 0,
    }))
    // sort by total workload desc, then userId asc for stability
    .sort((a, b) => b.assignedContents + b.assignedDeliverables - (a.assignedContents + a.assignedDeliverables) || a.userId.localeCompare(b.userId))
    // filter? keep all; but if many users with 0, keep them – tests can assert length.
    // For dashboard we keep only those with >0 or known users; if empty workload set, keep users with zeros.
    ;

  // Keep only users with at least one assignment OR if no assignments at all, keep all users (so empty state is visible)
  const hasAnyWorkload = [...contentCountByUser.values(), ...deliverableCountByUser.values()].some((v) => v > 0);
  const filteredWorkload = hasAnyWorkload ? teamWorkload.filter((w) => w.assignedContents > 0 || w.assignedDeliverables > 0 || w.overdue > 0) : teamWorkload;

  // --- attention ---
  const attention = {
    overdueProducts,
    overdueCount,
    failedPublications: failedPublications.map((p) => ({ id: p.id, platform: p.platform, deliverableId: p.deliverableId })),
    failedCount: publicationsFailedCount,
  };

  // --- kpis ---
  const kpis = {
    contentProductsTotal: totalProducts,
    contentProductsOverdue: overdueCount,
    contentProductsByStatus: byStatus,
    programsTotal: programsCount,
    deliverablesTotal: totalDeliverables,
    publicationsTotal: totalPublications,
    publicationsFailed: publicationsFailedCount,
    deliverablesByStatus,
    publicationsByStatus,
    progress,
  };

  const mailUnread = {
    info: mailInfo,
    support: mailSupport,
    total: mailInfo + mailSupport,
  };

  return jsonOk({
    kpis,
    byStatus,
    byChannel,
    byProductType,
    attention,
    teamWorkload: filteredWorkload,
    mailUnread,
    youtube,
    instagram,
    // also expose workflow breakdowns for convenience (not required but useful)
    workflow: {
      programsCount,
      deliverablesByStatus,
      publicationsByStatus,
      progress,
      totalDeliverables,
      totalPublications,
      failedPublications: attention.failedPublications,
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  return handleDashboardSummaryRequest(request, defaultDependencies);
}
