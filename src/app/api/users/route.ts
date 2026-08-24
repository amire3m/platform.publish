import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { createUserSchema } from "@/lib/validation";
import { generateEntityId } from "@/lib/ids";

export async function GET() {
  const { user, response } = await requirePermission("manage_users");
  if (!user) return response;
  const rows = await db.select().from(users).orderBy(users.createdAt);
  return jsonOk(rows);
}

export async function POST(req: Request) {
  const { user, response } = await requirePermission("manage_users");
  if (!user) return response;

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");

  const [created] = await db
    .insert(users)
    .values({
      id: generateEntityId("USR"),
      telegramId: parsed.data.telegramId,
      name: parsed.data.name,
      username: parsed.data.username,
      phone: parsed.data.phone,
      role: parsed.data.role,
      allowedAccountIds: parsed.data.allowedAccountIds,
      allowedActions: parsed.data.allowedActions,
      active: true,
    })
    .returning();

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "user_created",
    entityType: "user",
    entityId: created.id,
    after: { role: created.role, telegramId: created.telegramId },
  });

  return jsonOk(created, 201);
}
