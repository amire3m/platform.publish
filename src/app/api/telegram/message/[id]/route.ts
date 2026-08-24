import { requirePermission, jsonOk, jsonError, jsonInternalError } from "@/lib/api-helpers";
import { TelegramClient, TelegramNotConfiguredError } from "@/lib/telegram/client";

// Returns a deep-link to view a message inside the Telegram group. The Bot
// API cannot fetch arbitrary message content by id (no "getMessage" method),
// so this endpoint only resolves the canonical t.me link; the actual content
// must be viewed inside Telegram itself, which is by design (Telegram is the
// source of truth, the panel is only a UI on top of it).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;
  const { id } = await params;
  const [messageId, threadId] = id.split(":");

  try {
    const client = TelegramClient.fromEnv();
    const link = client.buildMessageLink(Number(messageId), threadId ? Number(threadId) : undefined);
    return jsonOk({ link });
  } catch (err) {
    if (err instanceof TelegramNotConfiguredError) return jsonError(err.message, 400, "NOT_CONFIGURED");
    return jsonInternalError(err, "api/telegram/message/[id]");
  }
}
