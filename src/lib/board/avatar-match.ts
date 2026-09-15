import type { BoardChannelId } from "./types";

/** Normalize for fuzzy matching: lowercase, strip separators/whitespace, unify Persian/Arabic forms. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\s\u200c\u200d\-_|/]+/g, "")
    .replace(/ضدروایت/g, "ضدروایت");
}

/**
 * Match a YouTube account display name (e.g. "ZedRevayat | ضدروایت")
 * to a board channel. Returns the board channel id or null.
 * Real-data fallback when no explicit channel linkage exists.
 */
export function matchBoardChannel(
  displayName: string,
  channels: Array<{ id: BoardChannelId; nameFa: string }>,
): BoardChannelId | null {
  const hay = normName(displayName);
  if (!hay) return null;
  for (const ch of channels) {
    const idKey = normName(ch.id.replace(/_/g, ""));
    const faKey = normName(ch.nameFa);
    if ((idKey && hay.includes(idKey)) || (faKey && hay.includes(faKey))) return ch.id;
  }
  return null;
}
