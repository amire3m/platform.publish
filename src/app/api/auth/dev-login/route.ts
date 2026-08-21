// Development-only login path used when the sandbox has no public HTTPS
// domain for the real Telegram Login Widget callback. Disabled by default in
// production unless ALLOW_DEV_LOGIN=1 is explicitly set — never enable this
// on a real deployment reachable by untrusted users.
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signSession, SESSION_COOKIE } from "@/lib/auth";
import { jsonError, jsonOk, rateLimit, clientKeyFromRequest } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { generateEntityId } from "@/lib/ids";

export async function POST(req: Request) {
  if (process.env.ALLOW_DEV_LOGIN !== "1") {
    return jsonError("ورود آزمایشی غیرفعال است.", 403);
  }
  if (!rateLimit(`dev-login:${clientKeyFromRequest(req)}`, 10, 60_000)) {
    return jsonError("تعداد تلاش بیش از حد مجاز است.", 429);
  }

  const { telegramId, name } = (await req.json()) as { telegramId?: string; name?: string };
  if (!telegramId) return jsonError("شناسه تلگرام الزامی است.", 400);

  const [existing] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  let user = existing;
  if (!user) {
    const countResult = await db.execute(`select count(*)::int as count from users`);
    const count = Number(countResult.rows[0]?.count ?? 0);
    const isBootstrapOwner = telegramId === process.env.OWNER_TELEGRAM_ID || count === 0;
    const [created] = await db
      .insert(users)
      .values({
        id: generateEntityId("USR"),
        telegramId,
        name: name || "کاربر آزمایشی",
        role: isBootstrapOwner ? "owner" : "viewer",
        active: true,
        isOwnerProtected: isBootstrapOwner,
      })
      .returning();
    user = created;
  }

  if (!user.active) return jsonError("حساب کاربری غیرفعال است.", 403);

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
    action: "dev_login",
    entityType: "user",
    entityId: user.id,
  });

  return jsonOk({ id: user.id, name: user.name, role: user.role });
}
