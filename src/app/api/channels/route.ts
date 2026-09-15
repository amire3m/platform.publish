import { z } from "zod";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { CHANNEL_IDS, VISIBLE_CHANNELS, getChannelConfig } from "@/lib/channels";
import { mergeChannelOverrides, readChannelOverrides, saveChannelOverride } from "@/lib/channel-accounts";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  const { user, response } = await requirePermission("view_content_room");
  if (!user) return response!;

  try {
    const channels = mergeChannelOverrides(VISIBLE_CHANNELS, await readChannelOverrides());
    return jsonOk({ channels });
  } catch (error) {
    return jsonInternalError(error, "api/channels GET");
  }
}

const patchSchema = z.object({
  channelId: z.enum(CHANNEL_IDS as unknown as [string, ...string[]]),
  platform: z.enum(["youtube", "instagram", "telegram"]),
  accountId: z.string().trim().nullable().optional(),
  telegramTopicId: z.string().trim().nullable().optional(),
});

export async function PATCH(request: Request) {
  // require manage_channels OR manage_content_room
  const { user, response } = await requirePermission("view_content_room");
  if (!user) return response!;

  const subject = { role: user.role, allowedActions: user.allowedActions, allowedAccountIds: user.allowedAccountIds };
  const canManage = hasPermission(subject, "manage_channels") || hasPermission(subject, "manage_content_room");
  if (!canManage) {
    return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
  }

  const { channelId, platform, accountId } = parsed.data;
  const cfg = getChannelConfig(channelId);
  if (!cfg) return jsonError("کانال یافت نشد.", 404, "NOT_FOUND");

  // For now we do not persist to DB - config is static (null fallback).
  // Validate accountId exists in social_accounts if provided
  if (accountId) {
    try {
      const { db } = await import("@/db");
      const { socialAccounts } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, accountId)).limit(1);
      if (!row) return jsonError("حساب کاربری یافت نشد.", 404, "NOT_FOUND");
      const plat = (row as unknown as { platform: string }).platform;
      if (plat !== platform && platform !== "telegram") {
        return jsonError(`نوع پلتفرم حساب (${plat}) با درخواست (${platform}) مطابقت ندارد.`, 422, "VALIDATION_ERROR");
      }
    } catch {
      // DB not available - allow null fallback
    }
  }

  // Persist the override; other platforms keep their previous values.
  try {
    const actorUserId = (user as unknown as { id?: string }).id ?? null;
    const patch: { youtubeAccountId?: string | null; instagramAccountId?: string | null; telegramTopicId?: string | null } = {};
    if (platform === "youtube") patch.youtubeAccountId = accountId ?? null;
    if (platform === "instagram") patch.instagramAccountId = accountId ?? null;
    if (platform === "telegram") patch.telegramTopicId = accountId ?? parsed.data.telegramTopicId ?? null;
    const saved = await saveChannelOverride(channelId, patch, actorUserId);
    const [channel] = mergeChannelOverrides([cfg], { [channelId]: saved });
    return jsonOk({ channel });
  } catch (error) {
    return jsonInternalError(error, "api/channels PATCH");
  }
}