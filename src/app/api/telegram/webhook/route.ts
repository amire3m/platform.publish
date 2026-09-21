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

  const iq = (body as { inline_query?: { id: string; from?: { id: number | string }; query: string } })?.inline_query;
  if (iq) {
    try {
      await handleInlineQuery(iq);
    } catch (err) {
      console.error("[webhook] inline query failed:", (err as Error).message);
    }
    return Response.json({ ok: true });
  }

  const msg = (body as { message?: { message_id: number; chat: { id: number; type?: string }; from?: { id: number | string; first_name?: string; last_name?: string; username?: string }; video?: { file_id: string; file_unique_id: string; duration?: number; thumbnail?: { file_id: string }; file_name?: string }; document?: { file_id: string; file_unique_id: string; mime_type?: string; file_name?: string; thumbnail?: { file_id: string } }; caption?: string; text?: string; date?: number; message_thread_id?: number; reply_to_message?: { message_id: number; video?: { file_id: string }; document?: { file_id: string; mime_type?: string; file_name?: string }; caption?: string; from?: { id: number | string } } } })?.message;
  const hasVideo = !!(msg?.video || (msg?.document && String(msg.document?.mime_type || "").startsWith("video/")));
  const replyTarget = msg?.reply_to_message;
  const hasVideoInReply = !!(replyTarget?.video || (replyTarget?.document && String(replyTarget?.document?.mime_type || "").startsWith("video/")));
  const isLinkCommand = (t?: string) => !!t && /(لینک|link|\/link)/i.test(t);
  const isLiveCommand = (t?: string) => !!t && /^(\/live|!live|پنل لایو|لایو)$/i.test(t.trim());
  // /live → the live conductor panel lives in its own topic (2540); don't touch group video flow
  if (msg && isLiveCommand(msg.text)) {
    return Response.json({ ok: true });
  }
  // old file via reply: user replies "لینک" to an old video
  if (msg && hasVideoInReply && isLinkCommand(msg.text)) {
    const groupId = process.env.TELEGRAM_GROUP_ID;
    if (String(msg.chat?.id) !== String(groupId)) {
      return Response.json({ ok: true });
    }
    // A pending "reply-to-link" session (armed from the panel) takes precedence
    const targetFileIdRaw = replyTarget!.video?.file_id || replyTarget!.document?.file_id || "";
    const handled = await tryHandlePendingReply(msg as never, replyTarget!.message_id, targetFileIdRaw || null);
    if (handled) return Response.json({ ok: true });
    const targetId = String(replyTarget!.message_id);
    const targetFileId = replyTarget!.video?.file_id || replyTarget!.document?.file_id || "";
    try {
      const { beautifyGroupVideoPrompt } = await import("@/lib/telegram/beautify");
      const beautiful = beautifyGroupVideoPrompt({
        messageId: replyTarget!.message_id,
        from: replyTarget!.from as never,
        caption: replyTarget!.caption,
        date: msg.date,
      });
      // override text to indicate old file
      const text = beautiful.text.replace("ویدیویی دریافت شد", "فایل قدیمی انتخاب شد") + "\n\n<i>ریپلای شما به این فایل بود — همین را لینک کنید:</i>";
      const chatIdStr = String(msg.chat.id).replace("-100", "");
      const url = "https://t.me/c/" + chatIdStr + "/" + targetId;
      const kb = {
        inline_keyboard: [
          [
            { text: "\u2795 \u0627\u0641\u0632\u0648\u062f\u0646 \u0628\u0647 \u0645\u062d\u0635\u0648\u0644 \u0645\u0648\u062c\u0648\u062f", callback_data: "link_existing:" + targetId },
            { text: "\uD83C\uDD95 \u0633\u0627\u062e\u062a \u0645\u062d\u0635\u0648\u0644 \u062c\u062f\u06CC\u062f", callback_data: "link_new:" + targetId },
          ],
          [{ text: "\uD83D\uDD17 \u0645\u0634\u0627\u0647\u062f\u0647 \u062f\u0631 \u06AF\u0631\u0648\u0647", url }],
        ],
      };
      const { TelegramClient } = await import("@/lib/telegram/client");
      const client = TelegramClient.fromEnv();
      try {
        await client.sendMessage(text, msg.message_thread_id, { parseMode: "HTML", replyMarkup: kb, replyToMessageId: msg.message_id } as never);
      } catch (err) {
        const msgErr = (err as Error).message || "";
        if (msgErr.includes("message thread not found") || msgErr.includes("thread not found")) {
          await client.sendMessage(text, undefined, { parseMode: "HTML", replyMarkup: kb, replyToMessageId: msg.message_id } as never);
        } else throw err;
      }
    } catch (err) {
      console.error("[webhook] old file reply failed:", (err as Error).message);
    }
    return Response.json({ ok: true });
  }
  if (msg && hasVideo) {
    const groupId = process.env.TELEGRAM_GROUP_ID;
    if (String(msg.chat?.id) !== String(groupId)) {
      return Response.json({ ok: true });
    }
    const messageIdStr = String(msg.message_id);
    // idempotency: one reply per message_id via workflow_events
    try {
      const { db } = await import("@/db");
      const { workflowEvents } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      const existing = await db
        .select()
        .from(workflowEvents)
        .where(and(eq(workflowEvents.entityType, "telegram_group_message"), eq(workflowEvents.entityId, messageIdStr), eq(workflowEvents.action, "group_video_replied")))
        .limit(1);
      if (existing && existing.length > 0) {
        return Response.json({ ok: true });
      }
    } catch {
      // if DB unavailable (e.g. tests without DB), continue to send reply
    }

    try {
      const { beautifyGroupVideoPrompt } = await import("@/lib/telegram/beautify");
      const beautiful = beautifyGroupVideoPrompt({
        messageId: msg.message_id,
        from: msg.from,
        caption: msg.caption,
        date: msg.date,
      });
      const chatIdStr = String(msg.chat.id).replace("-100", "");
      const url = "https://t.me/c/" + chatIdStr + "/" + String(msg.message_id);
      const kb = {
        inline_keyboard: [
          [
            { text: "\u2795 \u0627\u0641\u0632\u0648\u062f\u0646 \u0628\u0647 \u0645\u062d\u0635\u0648\u0644 \u0645\u0648\u062c\u0648\u062f", callback_data: "link_existing:" + String(msg.message_id) },
            { text: "\uD83C\uDD95 \u0633\u0627\u062e\u062a \u0645\u062d\u0635\u0648\u0644 \u062c\u062f\u06CC\u062f", callback_data: "link_new:" + String(msg.message_id) },
          ],
          [{ text: "\uD83D\uDD17 \u0645\u0634\u0627\u0647\u062f\u0647 \u062f\u0631 \u06AF\u0631\u0648\u0647", url }],
        ],
      };
      const { TelegramClient } = await import("@/lib/telegram/client");
      const client = TelegramClient.fromEnv();
      try {
        await client.sendMessage(beautiful.text, msg.message_thread_id, {
          parseMode: "HTML",
          replyMarkup: kb,
          replyToMessageId: msg.message_id,
        } as never);
      } catch (err) {
        const msgErr = (err as Error).message || "";
        if (msgErr.includes("message thread not found") || msgErr.includes("thread not found")) {
          await client.sendMessage(beautiful.text, undefined, {
            parseMode: "HTML",
            replyMarkup: kb,
            replyToMessageId: msg.message_id,
          } as never);
        } else {
          throw err;
        }
      }
      // record idempotency
      try {
        const { db } = await import("@/db");
        const { workflowEvents } = await import("@/db/schema");
        const { nanoid } = await import("nanoid");
        await db.insert(workflowEvents).values({
          id: "WFE-" + nanoid(8),
          entityType: "telegram_group_message",
          entityId: messageIdStr,
          action: "group_video_replied",
          before: null,
          after: {
            messageId: msg.message_id,
            chatId: msg.chat.id,
            fileId: msg.video?.file_id || msg.document?.file_id,
            messageThreadId: msg.message_thread_id ?? null,
            thumbFileId: msg.video?.thumbnail?.file_id || msg.document?.thumbnail?.file_id || null,
            durationSec: msg.video?.duration ?? null,
            fileName: msg.video?.file_name || msg.document?.file_name || null,
          } as unknown as Record<string, unknown>,
          actorUserId: null as unknown as string,
          source: "telegram_webhook",
        });
      } catch {}
    } catch (err) {
      console.error("[webhook] group video reply failed:", (err as Error).message);
    }
    return Response.json({ ok: true });
  }

  const cq = (body as { callback_query?: { id: string; data?: string; from: { id: number | string }; message?: { message_id: number; message_thread_id?: number; chat: { id: number } } } })?.callback_query;
  if (!cq) {
    // pending product search (armed from the picker 🔍 button) takes text replies
    if (msg && msg.text && !msg.video && !msg.document) {
      try {
        if (await tryHandleProductSearch(msg as never)) return Response.json({ ok: true });
      } catch (err) {
        console.error("[webhook] product search failed:", (err as Error).message);
      }
      // new-product title step (armed from link_new)
      try {
        const mod = (await import("@/lib/telegram/callback-router")) as unknown as {
          handleNewProductTitle?: (from: string, text: string, threadId?: number) => Promise<{ handled: boolean }>;
        };
        if (mod.handleNewProductTitle) {
          const r = await mod.handleNewProductTitle(String(msg.from?.id ?? ""), msg.text, msg.message_thread_id);
          if (r?.handled) return Response.json({ ok: true });
        }
      } catch (err) {
        console.error("[webhook] new-product title failed:", (err as Error).message);
      }
    }
    // /live command + playlist reply handling for the live conductor
    if (msg && msg.text) {
      const handled = await handleLiveTextMessage(msg as never);
      if (handled) return Response.json({ ok: true });
    }
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
  const cbStarted = Date.now();
  try {
    const { routeCallback } = await import("@/lib/telegram/callback-router");
    result = await routeCallback(action, contentId, fromTelegramId, cq.message?.message_id, cq.message?.message_thread_id);
  } catch (err) {
    console.error("[webhook] routeCallback failed:", (err as Error).message);
    result = { ok: false, message: "\u062E\u0637\u0627\u06CC \u062F\u0627\u062E\u0644\u06CC \u0631\u062E \u062F\u0627\u062F." };
  } finally {
    console.log(`[webhook] callback ${action} handled in ${Date.now() - cbStarted}ms ok=${result!.ok}`);
  }

  try {
    const { TelegramClient } = await import("@/lib/telegram/client");
    const client = TelegramClient.fromEnv();
    await client.answerCallbackQuery(cq.id, result.message);
    if (result.ok && cq.message?.message_id && !action.startsWith("link_") && action !== "live") {
      await client.editMessageReplyMarkup(cq.message.message_id, { inline_keyboard: [] });
    }
  } catch (err) {
    console.error("[webhook] telegram callback answer/edit failed:", (err as Error).message);
  }

  return Response.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Live conductor text flows: /live panel command + playlist reply-to-start
// ---------------------------------------------------------------------------
type LiveTextMessage = {
  message_id: number;
  chat: { id: number };
  from?: { id: number | string };
  text: string;
  message_thread_id?: number;
};

// ---------------------------------------------------------------------------
// Pending "reply to link" (armed from the content room panel) — short TTL
// ---------------------------------------------------------------------------
async function tryHandlePendingReply(msg: { chat: { id: number }; from?: { id: number | string }; message_thread_id?: number; message_id: number }, targetMessageId: number, targetFileId: string | null): Promise<boolean> {
  try {
    const { consumePendingReply } = await import("@/lib/content-room/pending-link");
    const pending = consumePendingReply(String(msg.from?.id ?? ""));
    if (!pending) return false;
    const groupId = process.env.TELEGRAM_GROUP_ID || "";
    if (String(msg.chat?.id) !== String(groupId)) return false;

    const { TelegramClient } = await import("@/lib/telegram/client");
    const client = TelegramClient.fromEnv();
    const reply = async (html: string) => {
      try {
        await client.sendMessage(html, msg.message_thread_id, { parseMode: "HTML", replyToMessageId: msg.message_id });
      } catch {
        await client.sendMessage(html, undefined, { parseMode: "HTML", replyToMessageId: msg.message_id }).catch(() => {});
      }
    };
    const kindLabel = pending.kind === "video" ? "ویدیو کامل" : pending.kind === "cover" ? "کاور" : pending.kind === "highlight" ? "برش" : pending.kind === "reel" ? "ریلز" : "نسخه کلین";

    try {
      const { db } = await import("@/db");
      const { contentParts } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [part] = await db.select().from(contentParts).where(eq(contentParts.id, pending.partId)).limit(1);
      if (!part) {
        await reply("⚠️ قسمت هدف دیگر موجود نیست؛ لینک انجام نشد.");
        return true;
      }
      // Reply target lacked file_id → resolve via temp forward (self-hosted bot API)
      let fileId = targetFileId && !targetFileId.startsWith("tg_msg_") ? targetFileId : null;
      if (!fileId) {
        const resolved = await client.resolveVideoByForward(String(msg.chat.id), targetMessageId);
        fileId = resolved?.fileId ?? null;
      }
      const { linkPartMedia } = await import("@/lib/content-room/link");
      await linkPartMedia({
        partId: pending.partId,
        kind: pending.kind,
        messageId: String(targetMessageId),
        fileId,
        fileName: null,
        actorUserId: pending.userId,
        source: "telegram",
      });
      const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
      const productId = (part as unknown as { productId?: string }).productId ?? "";
      const url = base && productId ? `${base}/content-room/${productId}` : "";
      await reply(
        `✅ <b>${kindLabel}</b> به <b>قسمت ${pending.partNumber}</b> لینک شد.${fileId ? "" : "\n<i>شناسه فایل مستقیم نبود؛ در صورت نیاز از پنل مجدد لینک کنید.</i>"}${url ? `\n🔗 <a href="${url}">مشاهده محصول در اتاق محتوا</a>` : ""}`,
      );
      return true;
    } catch (err) {
      await reply(`⚠️ لینک ناموفق بود: ${String((err as Error).message).slice(0, 120)}`);
      return true;
    }
  } catch (err) {
    console.error("[webhook] pending reply failed:", (err as Error).message);
    return false;
  }
}

async function handleLiveTextMessage(msg: LiveTextMessage): Promise<boolean> {
  const groupId = process.env.TELEGRAM_GROUP_ID;
  if (!groupId || String(msg.chat?.id) !== String(groupId)) return false;
  const text = String(msg.text).trim();
  const { consumePendingStart, isPlaylistInput, normalizePlaylist } = await import("@/lib/live/telegram-conductor");

  // 1. /live or لایو command → post the control panel in the current topic
  if (/^(\/live|!live|پنل لایو|لایو)$/i.test(text)) {
    try {
      const { postLivePanel } = await import("@/lib/live/telegram-conductor");
      await postLivePanel(msg.message_thread_id, msg.message_id);
    } catch (err) {
      console.error("[webhook] live panel post failed:", (err as Error).message);
    }
    return true;
  }

  // 2. Pending start: user replied with a playlist link to the panel prompt
  const pending = consumePendingStart(String(msg.from?.id ?? ""));
  if (!pending) return false;
  const threadId = msg.message_thread_id;
  const { TelegramClient } = await import("@/lib/telegram/client");
  const client = TelegramClient.fromEnv();
  const reply = async (html: string) => {
    try {
      await client.sendMessage(html, threadId, { parseMode: "HTML", replyToMessageId: msg.message_id });
    } catch (err) {
      if (String((err as Error).message).includes("thread not found")) {
        await client.sendMessage(html, undefined, { parseMode: "HTML", replyToMessageId: msg.message_id });
      } else throw err;
    }
  };
  if (!isPlaylistInput(text)) {
    await reply("⚠️ این یک لینک/شناسه پلی‌لیست معتبر نیست. دوباره دستور <code>/live</code> را بفرستید.");
    return true;
  }
  try {
    const { startLiveFromChannel } = await import("@/lib/live/start");
    await startLiveFromChannel({ channelId: pending.channelId, playlistInput: normalizePlaylist(text) });
    await reply("🔴 <b>لایو شروع شد!</b>\nوضعیت را با دستور <code>/live</code> دنبال کنید.");
  } catch (err) {
    await reply(`⚠️ شروع لایو ناموفق بود: ${String(err instanceof Error ? err.message : err)}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Product search: inline queries (@bot title) + picker text replies (🔍)
// ---------------------------------------------------------------------------
function escapeInlineHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function findProductsByTitle(query: string, limit: number): Promise<Array<Record<string, unknown>>> {
  const { db } = await import("@/db");
  const { contentProducts } = await import("@/db/schema");
  const { desc, sql } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(contentProducts)
    .where(sql`${contentProducts.title} ILIKE ${"%" + query + "%"}`)
    .orderBy(desc(contentProducts.createdAt))
    .limit(limit);
  return rows as unknown as Array<Record<string, unknown>>;
}

function mapProductRow(r: Record<string, unknown>) {
  return {
    id: String(r.id ?? ""),
    title: String(r.title ?? "بدون عنوان"),
    productType: String(r.productType ?? r.product_type ?? ""),
    channel: String(r.channel ?? ""),
    status: String(r.status ?? "imported"),
    partsCount: Number(r.partsCount ?? r.parts_count ?? 0),
  };
}

async function handleInlineQuery(iq: { id: string; from?: { id: number | string }; query: string }): Promise<void> {
  const { TelegramClient } = await import("@/lib/telegram/client");
  const client = TelegramClient.fromEnv();
  const answer = (results: unknown[], switchPmText?: string) =>
    client.answerInlineQuery(iq.id, results, switchPmText ? { switchPmText, switchPmParameter: "search" } : undefined);
  const fromId = String(iq.from?.id ?? "");
  let allowed = false;
  try {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [u] = await db.select().from(users).where(eq(users.telegramId, fromId)).limit(1);
    allowed = !!u && (u as unknown as { active?: boolean }).active !== false;
  } catch {
    allowed = false;
  }
  if (!allowed) {
    await answer([]);
    return;
  }
  const q = (iq.query ?? "").trim();
  if (!q) {
    await answer([], "عنوان محصول را بنویسید");
    return;
  }
  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = await findProductsByTitle(q, 15);
  } catch {
    rows = [];
  }
  const { buildInlineResults } = await import("@/lib/telegram/inline-search");
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "") || null;
  await answer(buildInlineResults(rows.map(mapProductRow).filter((p) => p.id), base));
}

type ProductSearchMessage = {
  message_id: number;
  chat: { id: number };
  from?: { id: number | string };
  text: string;
  message_thread_id?: number;
};

async function tryHandleProductSearch(msg: ProductSearchMessage): Promise<boolean> {
  const text = String(msg.text ?? "").trim();
  if (/^(\/live|!live|پنل لایو|لایو)$/i.test(text)) return false;
  const fromId = String(msg.from?.id ?? "");
  const { consumePendingSearch } = await import("@/lib/content-room/pending-search");
  const pending = consumePendingSearch(fromId);
  if (!pending) return false;
  const groupId = process.env.TELEGRAM_GROUP_ID || "";
  const { TelegramClient } = await import("@/lib/telegram/client");
  const client = TelegramClient.fromEnv();
  const reply = async (html: string, kb?: { inline_keyboard: unknown[][] }) => {
    try {
      await client.sendMessage(html, msg.message_thread_id, { parseMode: "HTML", replyMarkup: kb, replyToMessageId: msg.message_id } as never);
    } catch {
      await client.sendMessage(html, undefined, { parseMode: "HTML", replyMarkup: kb, replyToMessageId: msg.message_id } as never).catch(() => {});
    }
  };
  if (String(msg.chat?.id) !== String(groupId)) return true;
  // same link permission as the picker
  let allowed = false;
  try {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { hasPermission } = await import("@/lib/permissions");
    const [u] = await db.select().from(users).where(eq(users.telegramId, fromId)).limit(1);
    const uu = u as unknown as { active?: boolean; role?: string; allowedActions?: string[]; allowedAccountIds?: string[] } | undefined;
    const subject = { role: uu?.role, allowedActions: uu?.allowedActions, allowedAccountIds: uu?.allowedAccountIds } as never;
    allowed =
      !!uu &&
      uu.active !== false &&
      (hasPermission(subject, "manage_content_room" as never) || hasPermission(subject, "update_assigned_content" as never));
  } catch {
    allowed = false;
  }
  if (!allowed) {
    await reply("شما مجوز جستجو ندارید.");
    return true;
  }
  if (text.length < 2) {
    await reply("عبارت جستجو کوتاه است؛ حداقل ۲ حرف بفرستید.");
    return true;
  }
  const backKb = { inline_keyboard: [[{ text: "↩ بازگشت به لیست", callback_data: `link_existing:${pending.messageId}:0` }]] };
  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = await findProductsByTitle(text, 11);
  } catch {
    rows = [];
  }
  if (!rows.length) {
    await reply(`موردی برای «${escapeInlineHtml(text.slice(0, 60))}» یافت نشد.`, backKb);
    return true;
  }
  const kb = {
    inline_keyboard: [
      ...rows.slice(0, 10).map((r) => {
        const rec = r as unknown as { id: string; title: string };
        const pid = String(rec.id ?? "");
        const title = String(rec.title ?? "بدون عنوان").slice(0, 30) || "بدون عنوان";
        return [{ text: title, callback_data: `link_pick_product:${pending.messageId}:${pid}:0` }];
      }),
      backKb.inline_keyboard[0],
    ],
  };
  await reply(`🔍 نتایج جستجو (${Math.min(rows.length, 10)}):`, kb);
  return true;
}
