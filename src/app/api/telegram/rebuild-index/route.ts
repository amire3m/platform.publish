import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { rebuildIndex } from "@/lib/telegram/tgdb";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

export async function POST() {
  const { user, response } = await requirePermission("manage_settings");
  if (!user) return response;

  const result = await rebuildIndex();
  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "rebuild_index",
    entityType: "settings",
    after: result,
  });
  return jsonOk(result);
}
