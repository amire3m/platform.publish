export async function POST(req: Request) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: true });
  }

  const cq = (body as { callback_query?: { id: string; data?: string; from: { id: number | string }; message?: { message_id: number; chat: { id: number } } } })?.callback_query;
  if (!cq) {
    return Response.json({ ok: true });
  }

  const dataStr = typeof cq.data === "string" ? cq.data : "";
  const sepIdx = dataStr.indexOf(":");
  let action = "";
  let contentId = "";
  if (sepIdx !== -1) {
    action = dataStr.slice(0, sepIdx);
    contentId = dataStr.slice(sepIdx + 1);
  } else {
    action = dataStr;
    contentId = "";
  }

  const fromTelegramId = String(cq.from?.id ?? "");

  let result: { ok: boolean; message: string };
  try {
    const { routeCallback } = await import("@/lib/telegram/callback-router");
    result = await routeCallback(action, contentId, fromTelegramId);
  } catch (err) {
    console.error("[webhook] routeCallback failed:", (err as Error).message);
    result = { ok: false, message: "خطای داخلی سرور." };
  }

  try {
    const { TelegramClient } = await import("@/lib/telegram/client");
    const client = TelegramClient.fromEnv();
    await client.answerCallbackQuery(cq.id, result.message);
    if (result.ok && cq.message?.message_id) {
      await client.editMessageReplyMarkup(cq.message.message_id, { inline_keyboard: [] });
    }
  } catch (err) {
    console.error("[webhook] telegram callback answer/edit failed:", (err as Error).message);
  }

  return Response.json({ ok: true });
}
