import jwt from "jsonwebtoken";

/** Short-lived playback URL for a Telegram file_id via /api/media/telegram. */
export function buildPlaybackUrl(fileId: string, mime?: string): string {
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  const token = jwt.sign({ fileId, contentType: mime }, secret, { expiresIn: "15m" });
  const base = process.env.APP_BASE_URL || "";
  return base ? `${base}/api/media/telegram/${token}` : `/api/media/telegram/${token}`;
}

export function isRealFileId(v: string | null | undefined): boolean {
  return !!v && !v.startsWith("tg_msg_") && !v.startsWith("sample_");
}
