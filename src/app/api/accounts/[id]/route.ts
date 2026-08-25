import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSnapshots, credentials, socialAccounts, users, workflowPublications } from "@/db/schema";
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

  // Published content keeps its historical metadata, while live account
  // references and provider data are removed with the account.
  await db.transaction(async (tx) => {
    await tx.delete(analyticsSnapshots).where(eq(analyticsSnapshots.accountId, id));
    await tx.delete(workflowPublications).where(eq(workflowPublications.socialAccountId, id));
    await tx
      .update(users)
      .set({ allowedAccountIds: sql`${users.allowedAccountIds} - ${id}`, updatedAt: new Date() })
      .where(sql`${users.allowedAccountIds} ? ${id}`);
    await tx.delete(socialAccounts).where(eq(socialAccounts.id, id));
    if (existing.credentialRef) {
      await tx.delete(credentials).where(eq(credentials.id, existing.credentialRef));
    }
  });

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "account_deleted",
    entityType: "social_account",
    entityId: id,
    before: existing,
  });

  return jsonOk({ success: true, deleted: true });
}
