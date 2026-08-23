import { db } from "@/db";
import { content } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { canAccessAccount } from "@/lib/permissions";
import { CHANNEL_IDS, getChannelLabelFa, CHANNELS } from "@/lib/channels";
import { isNotNull } from "drizzle-orm";

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

  return jsonOk(events);
}
