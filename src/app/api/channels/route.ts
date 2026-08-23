import { z } from "zod";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { CHANNEL_IDS, CHANNELS, getChannelsWithAccountStatus, getChannelConfig } from "@/lib/channels";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  const { user, response } = await requirePermission("view_content_room");
  if (!user) return response!;

  try {
    const channels = await getChannelsWithAccountStatus();
    return jsonOk({ channels });
  } catch {
    // fallback sync
    const channels = CHANNELS.map((c) => ({
      ...c,
      linked: {
        youtube: Boolean(c.youtubeAccountId),
        instagram: Boolean(c.instagramAccountId),
        telegram: Boolean(c.telegramTopicId),
      },
    }));
    return jsonOk({ channels });
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
    return jsonError(parsed.error.issues[0]?.message ?? "ورودی نامعتبر است.", 422, "VALIDATION_ERROR");
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

  // Return updated view (in-memory echo)
  const updated = {
    id: channelId,
    labelFa: cfg.labelFa,
    youtubeAccountId: platform === "youtube" ? (accountId ?? null) : cfg.youtubeAccountId,
    instagramAccountId: platform === "instagram" ? (accountId ?? null) : cfg.instagramAccountId,
    telegramTopicId: platform === "telegram" ? (accountId ?? parsed.data.telegramTopicId ?? null) : cfg.telegramTopicId,
  };

  return jsonOk({ channel: updated, note: "تنظیمات کانال به صورت ایستا (null fallback) است؛ برای ذخیره دائمی به اتصال دیتابیس یا کانفیگ ENV نیاز است." });
}
