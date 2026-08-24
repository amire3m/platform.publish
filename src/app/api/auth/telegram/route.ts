import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signSession, validateTelegramLoginPayload, SESSION_COOKIE } from "@/lib/auth";
import { jsonError, jsonOk, rateLimit, clientKeyFromRequest } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { generateEntityId } from "@/lib/ids";

export async function POST(req: Request) {
  if (!rateLimit(`telegram-login:${clientKeyFromRequest(req)}`, 10, 60_000)) {
    return jsonError("تعداد تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.", 429);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return jsonError("ورود با تلگرام پیکربندی نشده است. اطلاعات اتصال ربات را در تنظیمات سرور وارد کنید.", 500);
  }

  const payload = (await req.json()) as Record<string, string | number>;
  const isValid = validateTelegramLoginPayload(payload, botToken);
  if (!isValid) {
    return jsonError("اعتبارسنجی اطلاعات ورود تلگرام ناموفق بود.", 401);
  }

  const telegramId = String(payload.id);
  const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ") || "کاربر تلگرام";
  const username = payload.username ? String(payload.username) : null;

  const [existing] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);

  let user = existing;
  if (!user) {
    const countResult = await db.execute(`select count(*)::int as count from users`);
    const count = Number(countResult.rows[0]?.count ?? 0);
    const isBootstrapOwner =
      telegramId === process.env.OWNER_TELEGRAM_ID || count === 0;
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
    action: "login",
    entityType: "user",
    entityId: user.id,
  });

  return jsonOk({ id: user.id, name: user.name, role: user.role });
}
