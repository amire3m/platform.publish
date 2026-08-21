// AES-256-GCM helpers for encrypting OAuth tokens / secrets at rest.
// The key never touches Telegram or the client bundle; it is read from the
// server-only CREDENTIAL_ENCRYPTION_KEY environment variable.
import crypto from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY || "dev-only-insecure-key-change-me-32b!";
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Mask a sensitive value for safe display in the UI (never show tokens fully). */
export function maskSecret(value?: string | null): string {
  if (!value) return "—";
  if (value.length <= 6) return "••••";
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}
