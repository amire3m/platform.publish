import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { jsonError, jsonOk, rateLimit, clientKeyFromRequest } from "@/lib/api-helpers";
import {
  getCurrentUser,
  signSession,
  signImpersonation,
  verifyImpersonation,
  SESSION_COOKIE,
  IMPERSONATOR_COOKIE,
  IMPERSONATION_TTL_MS,
} from "@/lib/auth";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

/** Owner-only: start impersonating a staff member (auto-expires). */
export async function POST(req: Request) {
  if (!rateLimit(`impersonate:${clientKeyFromRequest(req)}`, 10, 60_000)) {
    return jsonError("تعداد تلاش بیش از حد مجاز است.", 429);
  }
  const owner = await getCurrentUser();
  if (!owner) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  if ((owner as unknown as { role?: string }).role !== "owner") {
    return jsonError("فقط مالک سیستم می‌تواند وارد حساب دیگران شود.", 403, "FORBIDDEN");
  }
  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const targetId = body?.userId?.trim();
  if (!targetId) return jsonError("شناسه کاربر الزامی است.", 422, "VALIDATION_ERROR");
  if (targetId === owner.id) return jsonError("ورود به حساب خودتان بی‌معناست.", 422, "VALIDATION_ERROR");

  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) return jsonError("کاربر یافت نشد.", 404, "NOT_FOUND");
  if (!target.active) return jsonError("حساب این کاربر غیرفعال است.", 422, "INACTIVE");

  const store = await cookies();
  store.set(SESSION_COOKIE, signSession({ userId: target.id, telegramId: target.telegramId, role: target.role }), COOKIE_OPTS);
  store.set(
    IMPERSONATOR_COOKIE,
    signImpersonation({ ownerId: owner.id, targetId: target.id, startedAt: Date.now() }),
    { ...COOKIE_OPTS, maxAge: Math.ceil(IMPERSONATION_TTL_MS / 1000) + 60 },
  );

  await appendAuditEvent({
    actorTelegramId: (owner as unknown as { telegramId?: string }).telegramId ?? null,
    actorUserId: owner.id,
    action: "impersonate_start",
    entityType: "user",
    entityId: target.id,
    after: { targetName: target.name, targetRole: target.role },
  });

  return jsonOk({ impersonating: { id: target.id, name: target.name, role: target.role }, expiresInMs: IMPERSONATION_TTL_MS });
}

/** Exit impersonation: restore the owner session. */
export async function DELETE() {
  const store = await cookies();
  const impToken = store.get(IMPERSONATOR_COOKIE)?.value;
  if (!impToken) return jsonError("در حالت ورودبه‌عنوان نیستید.", 422, "NOT_IMPERSONATING");
  const imp = verifyImpersonation(impToken);
  if (!imp) {
    store.delete(IMPERSONATOR_COOKIE);
    return jsonError("نشانه نامعتبر است؛ پاک شد.", 422, "INVALID");
  }
  const [owner] = await db.select().from(users).where(eq(users.id, imp.ownerId)).limit(1);
  if (!owner || !owner.active) {
    store.delete(SESSION_COOKIE);
    store.delete(IMPERSONATOR_COOKIE);
    return jsonError("حساب مالک در دسترس نیست؛ خارج شدید.", 401, "OWNER_UNAVAILABLE");
  }
  store.set(SESSION_COOKIE, signSession({ userId: owner.id, telegramId: owner.telegramId, role: owner.role }), COOKIE_OPTS);
  store.delete(IMPERSONATOR_COOKIE);

  await appendAuditEvent({
    actorTelegramId: (owner as unknown as { telegramId?: string }).telegramId ?? null,
    actorUserId: owner.id,
    action: "impersonate_end",
    entityType: "user",
    entityId: imp.targetId,
    after: { expired: imp.expired },
  });

  return jsonOk({ restored: { id: owner.id, name: owner.name } });
}
