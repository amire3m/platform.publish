import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const SESSION_COOKIE = "emro_session";
export const IMPERSONATOR_COOKIE = "emro_impersonator";
/** Owner impersonation auto-expires after this long. */
export const IMPERSONATION_TTL_MS = 60 * 60 * 1000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";

export interface ImpersonationPayload {
  ownerId: string;
  targetId: string;
  startedAt: number;
}

export function signImpersonation(payload: ImpersonationPayload): string {
  return jwt.sign(payload, JWT_SECRET);
}

export function verifyImpersonation(token: string): (ImpersonationPayload & { expired: boolean }) | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as ImpersonationPayload;
    if (!p?.ownerId || !p?.targetId || !p?.startedAt) return null;
    return { ...p, expired: Date.now() - p.startedAt > IMPERSONATION_TTL_MS };
  } catch {
    return null;
  }
}

export interface SessionPayload {
  userId: string;
  telegramId: string;
  role: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user || !user.active) return null;
  // Enforce impersonation expiry: restore the owner session on next request.
  const impToken = store.get(IMPERSONATOR_COOKIE)?.value;
  if (impToken) {
    const imp = verifyImpersonation(impToken);
    if (imp && imp.expired && imp.targetId === user.id) {
      const [owner] = await db.select().from(users).where(eq(users.id, imp.ownerId)).limit(1);
      if (owner && owner.active) {
        try {
          store.set(SESSION_COOKIE, signSession({ userId: owner.id, telegramId: owner.telegramId, role: owner.role }), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax" as const,
            path: "/",
            maxAge: 60 * 60 * 24 * 7,
          });
          store.delete(IMPERSONATOR_COOKIE);
        } catch {}
        return owner;
      }
    }
  }
  return user;
}

/** Valid (non-expired) impersonation state for the current request, if any. */
export async function getImpersonation(): Promise<(ImpersonationPayload & { expired: boolean }) | null> {
  const store = await cookies();
  const impToken = store.get(IMPERSONATOR_COOKIE)?.value;
  if (!impToken) return null;
  return verifyImpersonation(impToken);
}

/**
 * Validates the payload from the Telegram Login Widget using the official
 * algorithm: https://core.telegram.org/widgets/login#checking-authorization
 */
export function validateTelegramLoginPayload(
  data: Record<string, string | number>,
  botToken: string,
): boolean {
  const { hash, ...rest } = data as Record<string, string>;
  if (!hash) return false;
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("\n");
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  const authDate = Number(rest.auth_date || 0);
  const isFresh = Date.now() / 1000 - authDate < 60 * 60 * 24; // 24h window
  return hmac === hash && isFresh;
}

/** Validates Telegram Mini App `initData` string (WebAppData check). */
export function validateTelegramInitData(initData: string, botToken: string): Record<string, string> | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const pairs: string[] = [];
  params.forEach((value, key) => pairs.push(`${key}=${value}`));
  pairs.sort();
  const checkString = pairs.join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  if (hmac !== hash) return null;
  const result: Record<string, string> = {};
  params.forEach((value, key) => (result[key] = value));
  return result;
}
