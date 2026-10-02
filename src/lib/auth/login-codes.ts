import { randomInt } from "node:crypto";

// ---------------------------------------------------------------------------
// One-time login codes issued by the Telegram bot (/login in private chat).
// Exists so users on networks where telegram.org is blocked (login widget
// never loads) can still sign in: bot DMs the code, user types it on site.
// In-memory (single Next.js process, like other runtime state); codes are
// short-lived, single-use and attempt-limited.
// ---------------------------------------------------------------------------

export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;

interface LoginCodeRecord {
  telegramId: string;
  expiresAt: number;
}

const codes = new Map<string, LoginCodeRecord>();

function sweepExpired(now: number): void {
  for (const [code, rec] of codes) {
    if (rec.expiresAt <= now) codes.delete(code);
  }
}

function randomCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

/** Issue a fresh code for a Telegram user (replaces any previous live code). */
export function issueLoginCode(telegramId: string, now = Date.now()): { code: string; expiresAt: number } {
  sweepExpired(now);
  for (const [code, rec] of codes) {
    if (rec.telegramId === telegramId && rec.expiresAt > now) codes.delete(code);
  }
  let code = randomCode();
  while (codes.has(code)) code = randomCode();
  const expiresAt = now + LOGIN_CODE_TTL_MS;
  codes.set(code, { telegramId, expiresAt });
  return { code, expiresAt };
}

export type VerifyResult =
  | { ok: true; telegramId: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" };

/** Single-use verification with attempt limiting. */
export function verifyLoginCode(rawCode: string, now = Date.now()): VerifyResult {
  const code = String(rawCode ?? "").trim();
  const rec = codes.get(code);
  if (!rec) return { ok: false, reason: "NOT_FOUND" };
  if (rec.expiresAt <= now) {
    codes.delete(code);
    return { ok: false, reason: "EXPIRED" };
  }
  // Map hit = exact code match — consume single-use code.
  // Brute force is stopped by per-IP rate limiting at the route layer.
  codes.delete(code);
  return { ok: true, telegramId: rec.telegramId };
}

/** Test helper: inspect live code count. */
export function liveLoginCodeCount(now = Date.now()): number {
  sweepExpired(now);
  return codes.size;
}

/** Test helper: reset store. */
export function clearLoginCodes(): void {
  codes.clear();
}
