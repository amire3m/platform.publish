import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signSession, validateTelegramInitData, SESSION_COOKIE } from "@/lib/auth";
import { jsonError, jsonOk, rateLimit, clientKeyFromRequest } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { generateEntityId } from "@/lib/ids";

/**
 * Telegram Mini App login. The client sends `window.Telegram.WebApp.initData`
 * which we validate with the standard WebAppData HMAC, then bootstrap/upsert
 * the Telegram user exactly like the Login Widget flow.
 */
export async function POST(req: Request) {
  if (!rateLimit(`mini-app-login:${clientKeyFromRequest(req)}`, 10, 60_000)) {
    return jsonError("تعداد تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.", 429);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return jsonError("ورود با تلگرام پیکربندی نشده است. اطلاعات اتصال ربات را در تنظیمات سرور وارد کنید.", 500);
  }

  const body = (await req.json()) as { initData?: string };
  if (!body.initData) return jsonError("اطلاعات ورود تلگرام ارسال نشده است.", 400);

  const data = validateTelegramInitData(body.initData, botToken);
  if (!data) return jsonError("اعتبارسنجی اطلاعات ورود تلگرام ناموفق بود.", 401);

  let tgUser: { id?: string | number; first_name?: string; last_name?: string; username?: string };
  try {
    tgUser = JSON.parse(data.user ?? "{}");
  } catch {
    return jsonError("اطلاعات کاربر تلگرام نامعتبر است.", 400);
  }
  const telegramId = String(tgUser.id ?? "");
  if (!telegramId) return jsonError("شناسه کاربر تلگرام یافت نشد.", 400);

  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || "کاربر تلگرام";
  const username = tgUser.username ? String(tgUser.username) : null;

  const [existing] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);

  let user = existing;
  if (!user) {
    const countResult = await db.execute(`select count(*)::int as count from users`);
    const count = Number(countResult.rows[0]?.count ?? 0);
    const isBootstrapOwner = telegramId === process.env.OWNER_TELEGRAM_ID || count === 0;
    if (!isBootstrapOwner) {
      return jsonError("حساب شما در سامانه تعریف نشده است. با مالک سیستم تماس بگیرید.", 403);
    }
    const [created] = await db
      .insert(users)
      .values({
        id: generateEntityId("USR"),
        telegramId,
        name,
        username,
        role: "owner",
        active: true,
        isOwnerProtected: true,
      })
      .returning();
    user = created;
    await appendAuditEvent({
      actorTelegramId: telegramId,
      action: "owner_bootstrap",
      entityType: "user",
      entityId: user.id,
      after: { role: "owner" },
    });
  }

  if (!user.active) {
    return jsonError("حساب کاربری شما غیرفعال شده است.", 403);
  }

  const token = signSession({ userId: user.id, telegramId: user.telegramId, role: user.role });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  await appendAuditEvent({
    actorTelegramId: telegramId,
    actorUserId: user.id,
    action: "mini_app_login",
    entityType: "user",
    entityId: user.id,
  });

  return jsonOk({ id: user.id, name: user.name, role: user.role });
}
