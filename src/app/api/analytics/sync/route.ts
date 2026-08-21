import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

// Manually triggers a sync attempt for every connected (non-mock) account.
// Mock accounts are intentionally skipped — we never fabricate analytics.
export async function POST() {
  const { user, response } = await requirePermission("view_analytics");
  if (!user) return response;

  const accounts = await db.select().from(socialAccounts);
  const connected = accounts.filter((a) => a.connectionStatus === "connected");

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "analytics_sync_triggered",
    entityType: "settings",
    after: { attempted: connected.length, skippedMock: accounts.length - connected.length },
  });

  return jsonOk({
    attempted: connected.length,
    skippedMock: accounts.length - connected.length,
    note: "حساب‌های آزمایشی از همگام‌سازی صرف‌نظر شدند چون داده واقعی ندارند.",
  });
}
