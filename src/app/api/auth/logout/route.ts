import { cookies } from "next/headers";
import { SESSION_COOKIE, getCurrentUser } from "@/lib/auth";
import { jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

export async function POST() {
  const user = await getCurrentUser();
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  if (user) {
    await appendAuditEvent({
      actorTelegramId: user.telegramId,
      actorUserId: user.id,
      action: "logout",
      entityType: "user",
      entityId: user.id,
    });
  }
  return jsonOk({ success: true });
}
