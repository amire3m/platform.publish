import { requirePermission } from "@/lib/api-helpers";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { TelegramClient, TelegramNotConfiguredError } from "@/lib/telegram/client";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

export async function POST() {
  const { user, response } = await requirePermission("manage_settings");
  if (!user) return response;

  try {
    const client = TelegramClient.fromEnv();
    const result = await client.testConnection();
    await appendAuditEvent({
      actorTelegramId: user.telegramId,
      actorUserId: user.id,
      action: "telegram_test_connection",
      entityType: "settings",
      after: { botIsAdmin: result.botIsAdmin, isSupergroup: result.isSupergroup, topicsEnabled: result.topicsEnabled },
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof TelegramNotConfiguredError) {
      return jsonError(err.message, 400, "NOT_CONFIGURED");
    }
    console.error("[api/telegram/test-connection] failed", err);
    return jsonError("بررسی اتصال Telegram انجام نشد. دوباره تلاش کنید.", 502, "TELEGRAM_ERROR");
  }
}
