import { eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { accountSyncHttpStatus, syncYouTubeAccount } from "@/lib/analytics/sync";
import { canAccessAccount } from "@/lib/permissions";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

// GET /api/accounts/:id/capabilities
// POST /api/accounts/:id/sync
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (action !== "capabilities") return jsonError("عملیات نامعتبر است.", 404);

  const { user, response } = await requirePermission("view_content");
  if (!user) return response;
  if (!canAccessAccount(user, id)) {
    return jsonError("شما به این حساب دسترسی ندارید.", 403, "FORBIDDEN");
  }

  const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!account) return jsonError("حساب یافت نشد.", 404);
  return jsonOk(account.capabilities);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (action !== "sync") return jsonError("عملیات نامعتبر است.", 404);

  const { user, response } = await requirePermission("view_analytics");
  if (!user) return response;
  if (!canAccessAccount(user, id)) {
    return jsonError("شما به این حساب دسترسی ندارید.", 403, "FORBIDDEN");
  }

  const result = await syncYouTubeAccount(id);
  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "account_analytics_synced",
    entityType: "social_account",
    entityId: id,
    after: {
      accountId: id,
      status: result.status,
      snapshotCount: result.snapshotCount,
      ...(result.range ? { range: result.range } : {}),
    },
  });

  const status = accountSyncHttpStatus(result);
  if (status !== 200) {
    return jsonError(result.message ?? "همگام‌سازی آمار ناموفق بود.", status, result.code);
  }
  return jsonOk(result);
}
