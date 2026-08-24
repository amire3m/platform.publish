import { eq } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSnapshots, credentials, socialAccounts } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { z } from "zod";

const accountUpdateSchema = z.object({
  organization: z.enum(["emro", "sana"]).nullable().optional(),
  topicId: z.string().nullable().optional(),
  topicMessageThreadId: z.number().int().nullable().optional(),
  topicLabel: z.string().nullable().optional(),
}).strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_accounts");
  if (!user) return response;
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError("اطلاعات حساب نامعتبر است.", 422, "VALIDATION_ERROR");

  const [existing] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
  if (!existing) return jsonError("حساب یافت نشد.", 404);

  const [row] = await db
    .update(socialAccounts)
    .set({ ...parsed.data, updatedAt: new Date() })
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

  // Preserve internal content references, but remove OAuth credentials and
  // provider analytics so the disconnected account cannot be accessed again.
  await db.transaction(async (tx) => {
    await tx.delete(analyticsSnapshots).where(eq(analyticsSnapshots.accountId, id));
    await tx
      .update(socialAccounts)
      .set({ active: false, connectionStatus: "disconnected", credentialRef: null, updatedAt: new Date() })
      .where(eq(socialAccounts.id, id));
    if (existing.credentialRef) {
      await tx.delete(credentials).where(eq(credentials.id, existing.credentialRef));
    }
  });

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
