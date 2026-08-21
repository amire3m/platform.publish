import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { maskSecret } from "@/lib/crypto";

export async function GET() {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;

  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);

  return jsonOk({
    ...(row ?? {}),
    // Secrets never leave the server; only masked hints are exposed.
    telegramBotTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramGroupIdMasked: maskSecret(process.env.TELEGRAM_GROUP_ID),
    googleOauthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
    metaOauthConfigured: Boolean(process.env.META_APP_ID),
  });
}

export async function PATCH(req: Request) {
  const { user, response } = await requirePermission("manage_settings");
  if (!user) return response;

  const body = (await req.json()) as Partial<typeof appSettings.$inferInsert>;
  const [row] = await db
    .insert(appSettings)
    .values({ id: 1, ...body, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.id, set: { ...body, updatedAt: new Date() } })
    .returning();

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "settings_updated",
    entityType: "settings",
    after: body,
  });

  return jsonOk(row);
}
