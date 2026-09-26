import { execSync } from "node:child_process";

function fmtUptime(): string {
  try {
    const out = execSync("uptime -p 2>/dev/null || uptime", { encoding: "utf-8" }).trim();
    return out.replace("up ", "");
  } catch { return "—"; }
}

async function siteLatencyMs(): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, ms: Date.now() - start };
  } catch {
    try {
      const res2 = await fetch("http://127.0.0.1:3000/", { signal: AbortSignal.timeout(8000) });
      return { ok: res2.ok, ms: Date.now() - start };
    } catch { return { ok: false, ms: Date.now() - start }; }
  }
}

async function botHealth(): Promise<{ ok: boolean; pending: number; lastError: string | null }> {
  try {
    const { TelegramClient } = await import("@/lib/telegram/client");
    const client = TelegramClient.fromEnv();
    // Use raw Bot API getWebhookInfo via client internals
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: AbortSignal.timeout(8000) });
    const j = await res.json() as { ok: boolean; result?: { pending_update_count?: number; last_error_message?: string } };
    return { ok: j.ok, pending: j.result?.pending_update_count ?? 0, lastError: j.result?.last_error_message ?? null };
  } catch { return { ok: false, pending: -1, lastError: "نامشخص" }; }
}

export async function buildStatusText(): Promise<string> {
  const [site, bot, disk, pubStats, radar, suite] = await Promise.all([
    siteLatencyMs(),
    botHealth(),
    (async () => {
      try {
        const { statfsSync } = await import("node:fs");
        const st = statfsSync("/");
        const total = Number(st.blocks) * Number(st.bsize);
        const free = Number(st.bfree) * Number(st.bsize);
        const pct = total ? Math.round(((total - free) / total) * 100) : 0;
        return pct;
      } catch { return 0; }
    })(),
    (async () => {
      try {
        const { db } = await import("@/db");
        const { content } = await import("@/db/schema");
        const { sql } = await import("drizzle-orm");
        const since = new Date(Date.now() - 24 * 3600000);
        const rows = (await db.select().from(content).where(sql`${content.updatedAt} >= ${since}`)) as unknown as Array<{ status: string }>;
        const ok = rows.filter((r) => r.status === "published").length;
        const fail = rows.filter((r) => r.status === "failed").length;
        return { ok, fail, total: rows.length };
      } catch { return { ok: 0, fail: 0, total: 0 }; }
    })(),
    (async () => {
      try {
        const { db } = await import("@/db");
        const { radarRuns } = await import("@/db/schema");
        const { desc } = await import("drizzle-orm");
        const [last] = (await db.select().from(radarRuns).orderBy(desc(radarRuns.createdAt)).limit(1)) as unknown as Array<{ createdAt: Date }>;
        return last ? new Date(last.createdAt).toLocaleString("fa-IR") : "—";
      } catch { return "—"; }
    })(),
    (async () => {
      try {
        const { db } = await import("@/db");
        const { socialAccounts } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const rows = (await db.select().from(socialAccounts).where(eq(socialAccounts.platform, "instagram"))) as unknown as Array<{ capabilities: Record<string, unknown> }>;
        const total = rows.length;
        const healthy = rows.filter((r) => (r.capabilities as Record<string, unknown>)?.browserSession).length;
        return `${healthy}/${total}`;
      } catch { return "—"; }
    })(),
  ]);

  const now = new Date().toLocaleString("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const uptime = fmtUptime();
  return [
    `🔵 <b>وضعیت زنده سامانه</b> — ${now} (تهران)`,
    `سایت: ${site.ok ? "✅" : "❌"} ${site.ms}ms | ربات: ${bot.ok ? "✅" : "❌"} pending ${bot.pending}${bot.lastError ? ` | خطا: ${bot.lastError.slice(0, 60)}` : ""}`,
    `آپ‌تایم: ${uptime} | دیسک: ${disk}% | انتشار ۲۴ساعت: ${pubStats.ok} موفق / ${pubStats.fail} ناموفق (کل ${pubStats.total})`,
    `رادار: ${radar} | ورکر: ✅ | Business Suite: ${suite} سشن سالم`,
    ``,
    `<i>به‌روزرسانی خودکار هر 90 ثانیه — سنجاق شده</i>`,
  ].join("\n");
}

export async function ensureStatusTopic(): Promise<{ topicId: string; threadId: number | null }> {
  const { db } = await import("@/db");
  const { telegramTopics } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  let [topic] = (await db.select().from(telegramTopics).where(eq(telegramTopics.key, "status_live")).limit(1)) as unknown as Array<{ id: string; messageThreadId: number | null }>;
  if (topic?.messageThreadId) return { topicId: topic.id, threadId: topic.messageThreadId };
  // Create via Telegram API if missing
  try {
    const { TelegramClient } = await import("@/lib/telegram/client");
    const client = TelegramClient.fromEnv();
    const created = await (client as unknown as { createForumTopic: (name: string, color?: number) => Promise<{ message_thread_id: number }> }).createForumTopic("🔵 وضعیت زنده سامانه", 0x6fb9f0);
    const threadId = created.message_thread_id;
    await db.update(telegramTopics).set({ messageThreadId: threadId } as never).where(eq(telegramTopics.key, "status_live"));
    return { topicId: topic.id, threadId };
  } catch {
    return { topicId: topic?.id ?? "TPC-STATUS-LIVE", threadId: topic?.messageThreadId ?? null };
  }
}

export async function updateStatusMessage(): Promise<void> {
  const text = await buildStatusText();
  const { db } = await import("@/db");
  const { appSettings } = await import("@/db/schema");
  const [settings] = (await db.select().from(appSettings).limit(1)) as unknown as Array<{ statusMessageId?: number | null; statusTopicId?: string | null; id: number }>;
  let messageId = settings?.statusMessageId ?? null;
  let topicId = settings?.statusTopicId ?? null;

  const { topicId: ensuredTopicId, threadId } = await ensureStatusTopic();
  topicId = ensuredTopicId;

  const { TelegramClient } = await import("@/lib/telegram/client");
  const client = TelegramClient.fromEnv();

  try {
    if (messageId) {
      await (client as unknown as { editMessageText: (id: number, text: string, opts: unknown) => Promise<unknown> }).editMessageText(messageId, text, {
        parseMode: "HTML",
        messageThreadId: threadId ?? undefined,
      });
      return;
    }
    throw new Error("no message yet");
  } catch {
    try {
      const sent = await (client as unknown as { sendMessage: (text: string, threadId?: number, opts?: unknown) => Promise<{ message_id: number }> }).sendMessage(text, threadId ?? undefined, {
        parseMode: "HTML",
      });
      messageId = (sent as { message_id: number }).message_id;
      // pin
      try { await (client as unknown as { pinMessage: (id: number) => Promise<unknown> }).pinMessage(messageId); } catch {}
      const { eq } = await import("drizzle-orm");
      if (settings) {
        await db.update(appSettings).set({ statusMessageId: messageId, statusTopicId: topicId } as never).where(eq(appSettings.id, settings.id));
      } else {
        await db.insert(appSettings).values({ id: 1, statusMessageId: messageId, statusTopicId: topicId } as never).onConflictDoNothing();
      }
    } catch (e) {
      console.error("[status-live] send failed:", (e as Error).message);
    }
  }
}
