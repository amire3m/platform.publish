import jwt from "jsonwebtoken";

export function buildTelegramMediaUrl(fileId: string | null | undefined, contentType?: string): string | null {
  if (!fileId || fileId.startsWith("tg_msg_") || fileId.startsWith("sample_")) return null;
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  const token = jwt.sign({ fileId, ...(contentType ? { contentType } : {}) }, secret, { expiresIn: "15m" });
  return `/api/media/telegram/${token}`;
}
