import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, type Permission, type PermissionSubject } from "@/lib/permissions";

export function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export function jsonInternalError(error: unknown, context: string) {
  console.error(`[${context}]`, error);
  return jsonError("خطای داخلی سرور رخ داد. دوباره تلاش کنید.", 500, "INTERNAL_ERROR");
}

export function jsonOk<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") } as const;
  }
  return { user, response: null } as const;
}

export async function requirePermission(permission: Permission) {
  const { user, response } = await requireUser();
  if (!user) return { user: null, response } as const;
  const subject: PermissionSubject = {
    role: user.role,
    allowedActions: user.allowedActions,
    allowedAccountIds: user.allowedAccountIds,
  };
  if (!hasPermission(subject, permission)) {
    return {
      user: null,
      response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN"),
    } as const;
  }
  return { user, response: null } as const;
}

// --- very small in-memory rate limiter (per-process, best-effort) ----------
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function clientKeyFromRequest(req: Request): string {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local";
}
