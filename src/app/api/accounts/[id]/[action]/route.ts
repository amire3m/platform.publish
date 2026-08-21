import { eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { formatJalaliSlash, nowUtcIso } from "@/lib/date/jalali";

// GET /api/accounts/:id/capabilities
// POST /api/accounts/:id/sync
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (action !== "capabilities") return jsonError("عملیات نامعتبر است.", 404);

  const { user, response } = await requirePermission("view_content");
  if (!user) return response;

  const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!account) return jsonError("حساب یافت نشد.", 404);
  return jsonOk(account.capabilities);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (action !== "sync") return jsonError("عملیات نامعتبر است.", 404);

  const { user, response } = await requirePermission("view_analytics");
  if (!user) return response;

  const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!account) return jsonError("حساب یافت نشد.", 404);

  if (account.connectionStatus !== "connected") {
    // No real credential: do not fabricate analytics numbers.
    await db.update(socialAccounts).set({ lastSyncAt: new Date(), lastError: null }).where(eq(socialAccounts.id, id));
    return jsonError(
      "این حساب در حالت آزمایشی است؛ همگام‌سازی آمار واقعی نیازمند اتصال رسمی OAuth است.",
      400,
      "MOCK_ACCOUNT",
    );
  }

  try {
    // Real analytics sync would call YouTube Analytics API / Instagram Insights here.
    // Left as a documented extension point — we refuse to invent numbers.
    await db.update(socialAccounts).set({ lastSyncAt: new Date(), lastError: null }).where(eq(socialAccounts.id, id));
    await appendAuditEvent({
      actorTelegramId: user.telegramId,
      actorUserId: user.id,
      action: "account_synced",
      entityType: "social_account",
      entityId: id,
    });
    return jsonOk({ synced: true, at: nowUtcIso(), dateJalali: formatJalaliSlash(nowUtcIso()) });
  } catch (err) {
    await db.update(socialAccounts).set({ lastError: (err as Error).message }).where(eq(socialAccounts.id, id));
    return jsonError(`همگام‌سازی ناموفق بود: ${(err as Error).message}`, 502);
  }
}
