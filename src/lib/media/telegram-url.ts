import jwt from "jsonwebtoken";

function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;

  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    const [a, b] = octets;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
    );
  }

  if (host.includes(":")) {
    return !(
      host === "::"
      || host === "::1"
      || host.startsWith("::ffff:")
      || host.startsWith("fc")
      || host.startsWith("fd")
      || /^fe[89ab]/.test(host)
    );
  }
  return true;
}

export function buildTelegramMediaUrl(fileId: string | null | undefined, contentType?: string): string | null {
  if (!fileId || fileId.startsWith("tg_msg_") || fileId.startsWith("sample_")) return null;
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  const token = jwt.sign({ fileId, ...(contentType ? { contentType } : {}) }, secret, { expiresIn: "15m" });
  return `/api/media/telegram/${token}`;
}

/** Absolute, long-lived source URL for mirror remote-uploads (single file, revocable via JWT secret). */
export function buildMirrorSourceUrl(fileId: string | null | undefined): string | null {
  if (!fileId || fileId.startsWith("tg_msg_") || fileId.startsWith("sample_")) return null;
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) return null;
  let base: URL;
  try {
    base = new URL(process.env.APP_BASE_URL || "");
  } catch {
    return null;
  }
  if (
    base.protocol !== "https:"
    || base.username
    || base.password
    || base.pathname !== "/"
    || base.search
    || base.hash
    || !isPublicHostname(base.hostname)
  ) return null;
  // Long expiry: upstream has a single remote-upload slot, so a task's actual
  // download may lag submission by days while the backlog drains.
  const token = jwt.sign({ fileId, purpose: "mirror" }, secret, { expiresIn: "30d" });
  return new URL(`/api/media/telegram/${token}`, base).toString();
}
