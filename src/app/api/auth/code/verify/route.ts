import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signSession, SESSION_COOKIE } from "@/lib/auth";
import { firstZodIssueMessage, jsonError, jsonOk, rateLimit, clientKeyFromRequest } from "@/lib/api-helpers";
import { verifyLoginCode } from "@/lib/auth/login-codes";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

const bodySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "کد ورود باید ۶ رقم باشد."),
});

// POST /api/auth/code/verify — sign in with a one-time bot code (no telegram.org needed)
export async function POST(req: Request) {
  if (!rateLimit(`code-login:${clientKeyFromRequest(req)}`, 10, 60_000)) {
    return jsonError("تعداد تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
  }

  const result = verifyLoginCode(parsed.data.code);
  if (!result.ok) {
    const message =
      result.reason === "EXPIRED"
        ? "کد منقضی شده است. در تلگرام دوباره /login بفرستید."
        : "کد نامعتبر است.";
    return jsonError(message, 401, result.reason);
  }

  const [user] = await db.select().from(users).where(eq(users.telegramId, result.telegramId)).limit(1);
  if (!user) {
    return jsonError("حساب شما در سامانه تعریف نشده است. با مالک سیستم تماس بگیرید.", 403);
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
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "login",
    entityType: "user",
    entityId: user.id,
  });

  return jsonOk({ id: user.id, name: user.name, role: user.role });
}
