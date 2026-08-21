import { eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;
  const body = (await req.json()) as Partial<typeof socialAccounts.$inferInsert>;

  const [existing] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!existing) return jsonError("حساب یافت نشد.", 404);

  const [row] = await db
    .update(socialAccounts)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(socialAccounts.id, id))
    .returning();

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "account_updated",
    entityType: "social_account",
    entityId: id,
    before: existing,
    after: row,
  });

  return jsonOk(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;

  const [existing] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!existing) return jsonError("حساب یافت نشد.", 404);

  // Soft-disable rather than hard delete, to preserve historical content references.
  await db.update(socialAccounts).set({ active: false, connectionStatus: "disconnected" }).where(eq(socialAccounts.id, id));

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "account_disconnected",
    entityType: "social_account",
    entityId: id,
    before: existing,
  });

  return jsonOk({ success: true });
}
