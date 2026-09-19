import jwt from "jsonwebtoken";

export function buildTelegramMediaUrl(fileId: string | null | undefined, contentType?: string): string | null {
  if (!fileId || fileId.startsWith("tg_msg_") || fileId.startsWith("sample_")) return null;
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  const token = jwt.sign({ fileId, ...(contentType ? { contentType } : {}) }, secret, { expiresIn: "15m" });
  return `/api/media/telegram/${token}`;
}

/** Absolute, long-lived source URL for mirror remote-uploads (single file, revocable via JWT secret). */
export function buildMirrorSourceUrl(fileId: string | null | undefined): string | null {
  if (!fileId || fileId.startsWith("tg_msg_") || fileId.startsWith("sample_")) return null;
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  // Long expiry: upstream has a single remote-upload slot, so a task's actual
  // download may lag submission by days while the backlog drains.
  const token = jwt.sign({ fileId, purpose: "mirror" }, secret, { expiresIn: "7d" });
  return `${base}/api/media/telegram/${token}`;
}
