import { db } from "@/db";
import { content, workflowDeliverables, workflowPrograms, workflowPublications } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { canAccessAccount, hasPermission } from "@/lib/permissions";
import { CHANNEL_IDS, getChannelLabelFa, CHANNELS } from "@/lib/channels";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { formatJalaliSlash } from "@/lib/date/jalali";

const WORKFLOW_VISIBLE_STATUSES = ["scheduled", "ready", "publishing", "failed"] as const;

export async function GET(req: Request) {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");
  const accountId = url.searchParams.get("accountId");
  const status = url.searchParams.get("status");
  const channelParam = url.searchParams.get("channel");

  const rows = await db.select().from(content).where(isNotNull(content.scheduledAtUtc));

  function inferChannel(accountIdVal: string, platformVal: string, extraChannel?: string | null): string | null {
    if (extraChannel && (CHANNEL_IDS as readonly string[]).includes(extraChannel)) return extraChannel;
    if ((CHANNEL_IDS as readonly string[]).includes(accountIdVal)) return accountIdVal;
    for (const ch of CHANNELS) {
      if (ch.youtubeAccountId === accountIdVal || ch.instagramAccountId === accountIdVal) return ch.id;
    }
    // fallback: treat telegram topic as channel? not needed
    if (platformVal === "telegram" && accountIdVal) return null;
    return null;
  }

  /** Channel of a workflow program: seriesName is stored as "<productType> / <channel>". */
  function channelFromProgram(program: { seriesName?: string | null } | undefined, accountIdVal: string | null, platformVal: string): string | null {
    const series = program?.seriesName ?? "";
    const m = series.match(/\/\s*([a-z_]+)\s*$/);
    if (m && (CHANNEL_IDS as readonly string[]).includes(m[1])) return m[1];
    if (accountIdVal) return inferChannel(accountIdVal, platformVal);
    return null;
  }

  const events = rows.flatMap((row) => {
    const targets = (row.platformTargets as {
      platform: string;
      account_id: string;
      content_type: string;
      status: string;
      publish_at_utc?: string;
      publish_at_jalali?: string;
      workflow_publication_id?: string | null;
      channel?: string | null;
    }[]) ?? [];
    return targets
      .filter((t) => {
        if (platform && t.platform !== platform) return false;
        if (accountId && t.account_id !== accountId) return false;
        if (status && t.status !== status) return false;
        const inferred = inferChannel(t.account_id, t.platform, (t as unknown as { channel?: string | null }).channel ?? null);
        if (channelParam && inferred !== channelParam) return false;
        return canAccessAccount(user, t.account_id);
      })
      .map((t) => {
        const inferredChannel = inferChannel(t.account_id, t.platform, (t as unknown as { channel?: string | null }).channel ?? null);
        return {
          contentId: row.id,
          publicationId: t.workflow_publication_id ?? null,
          title: row.title || "(بدون عنوان)",
          platform: t.platform,
          accountId: t.account_id,
          channel: inferredChannel,
          channelLabel: inferredChannel ? getChannelLabelFa(inferredChannel) : null,
          contentType: t.content_type,
          status: t.status,
          publishAtUtc: t.publish_at_utc ?? (row.scheduledAtUtc instanceof Date ? (row.scheduledAtUtc as Date).toISOString() : (row.scheduledAtUtc as unknown as string)),
          publishAtJalali: t.publish_at_jalali ?? row.scheduledAtJalali,
          contentStatus: row.status,
          approvalStatus: row.approvalStatus,
          hasError: Boolean(row.error),
          thumbnailAvailable: (row.media as unknown[])?.length > 0,
        };
      });
  });

  // --- Workflow publish room: scheduled publications (content-room → send page) ---
  // These never create rows in the legacy `content` table, so list them directly.
  try {
    const pubs = await db
      .select({
        pub: workflowPublications,
        deliverable: workflowDeliverables,
        program: workflowPrograms,
      })
      .from(workflowPublications)
      .innerJoin(workflowDeliverables, eq(workflowPublications.deliverableId, workflowDeliverables.id))
      .innerJoin(workflowPrograms, eq(workflowDeliverables.programId, workflowPrograms.id))
      .where(
        and(
          isNotNull(workflowPublications.scheduledAt),
          inArray(workflowPublications.status, [...WORKFLOW_VISIBLE_STATUSES] as string[]),
        ),
      )
      .limit(500);

    for (const { pub, deliverable, program } of pubs) {
      const p = pub as unknown as {
        id: string;
        platform: string;
        socialAccountId: string | null;
        status: string;
        scheduledAt: Date | string | null;
        lastErrorMessage: string | null;
      };
      const d = deliverable as unknown as { id: string; name: string; kind: string | null; productionStatus: string };
      const prog = program as unknown as { id: string; title: string; seriesName: string | null; archivedAt: Date | null };
      if (prog.archivedAt) continue;
      if (platform && p.platform !== platform) continue;
      if (accountId && (p.socialAccountId ?? "") !== accountId) continue;
      if (status && p.status !== status) continue;
      const ch = channelFromProgram(prog, p.socialAccountId, p.platform);
      if (channelParam && ch !== channelParam) continue;
      if (p.socialAccountId) {
        if (!canAccessAccount(user, p.socialAccountId)) continue;
      } else if (!hasPermission(user, "manage_publications")) {
        continue;
      }
      if (!p.scheduledAt) continue;
      const scheduledIso = p.scheduledAt instanceof Date ? p.scheduledAt.toISOString() : String(p.scheduledAt);
      events.push({
        contentId: d.id,
        publicationId: p.id,
        programId: prog.id,
        title: d.name || prog.title || "(بدون عنوان)",
        platform: p.platform,
        accountId: p.socialAccountId ?? "",
        channel: ch,
        channelLabel: ch ? getChannelLabelFa(ch) : null,
        contentType: d.kind ?? "",
        status: p.status,
        publishAtUtc: scheduledIso,
        // Slash form ("1405/07/14 15:30") — the calendar grid parses this exact shape.
        publishAtJalali: formatJalaliSlash(scheduledIso),
        contentStatus: d.productionStatus,
        approvalStatus: null,
        hasError: Boolean(p.lastErrorMessage),
        thumbnailAvailable: false,
      } as never);
    }
  } catch (e) {
    // Never break the legacy listing if the workflow join fails
    console.error("[calendar] workflow publications listing failed:", (e as Error).message);
  }

  return jsonOk(events);
}
