import { z } from "zod";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

// POST /api/auth/code/verify — sign in with a one-time bot code (no telegram.org needed).
// JSON callers (React form) get JSON; native form posts (no-JS fallback) get a 303 redirect.
export async function POST(req: Request) {
  if (!rateLimit(`code-login:${clientKeyFromRequest(req)}`, 10, 60_000)) {
    return jsonError("تعداد تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.", 429);
  }
  const isNativeForm = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  const fail = (message: string, status: number, code?: string): Response => {
    if (isNativeForm) {
      const url = new URL("/login", req.url);
      url.searchParams.set("err", code === "EXPIRED" ? "expired" : "invalid");
      return NextResponse.redirect(url, 303);
    }
    return jsonError(message, status, code);
  };

  let rawCode: unknown;
  try {
    if (isNativeForm) {
      const form = await req.formData();
      rawCode = form.get("code");
    } else {
      const body = (await req.json()) as unknown;
      rawCode = (body as { code?: unknown })?.code;
    }
  } catch {
    return fail("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const parsed = bodySchema.safeParse({ code: rawCode });
  if (!parsed.success) {
    return fail(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
  }

  const result = verifyLoginCode(parsed.data.code);
  if (!result.ok) {
    const message =
      result.reason === "EXPIRED"
        ? "کد منقضی شده است. در تلگرام دوباره /login بفرستید."
        : "کد نامعتبر است.";
    return fail(message, 401, result.reason);
  }

  const [user] = await db.select().from(users).where(eq(users.telegramId, result.telegramId)).limit(1);
  if (!user) {
    return fail("حساب شما در سامانه تعریف نشده است. با مالک سیستم تماس بگیرید.", 403, "FORBIDDEN");
  }
  if (!user.active) {
    return fail("حساب کاربری شما غیرفعال شده است.", 403, "FORBIDDEN");
  }

  const token = signSession({ userId: user.id, telegramId: user.telegramId, role: user.role });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, COOKIE_OPTS);

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "login",
    entityType: "user",
    entityId: user.id,
  });

  if (isNativeForm) {
    const res = NextResponse.redirect(new URL("/dashboard", req.url), 303);
    res.cookies.set(SESSION_COOKIE, token, COOKIE_OPTS);
    return res;
  }
  return jsonOk({ id: user.id, name: user.name, role: user.role });
}
