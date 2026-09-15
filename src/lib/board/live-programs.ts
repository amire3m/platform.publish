import type { BoardChannelId } from "./types";

/** Normalize for fuzzy matching: lowercase, strip separators, unify Persian/Arabic forms. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\s\u200c\u200d\-_|/]+/g, "");
}

/**
 * Match a YouTube account display name (e.g. "ZedRevayat | ضدروایت")
 * to a board channel. Real-data fallback when no explicit linkage exists.
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

const CURATED_PROGRAMS: Array<{ match: RegExp; program: string }> = [
  { match: /فرات/, program: "فرات" },
  { match: /قابل توجه/, program: "قابل توجه" },
  { match: /مشاور/, program: "مشاور ۱" },
  { match: /پرونده اجتماعی/, program: "پرونده اجتماعی" },
];

/** Clean a playlist title into a short program label. */
export function cleanProgramTitle(title: string): string {
  const cut = title.split(/[|｜–—-]/)[0] ?? title;
  return cut.trim().slice(0, 40) || "سایر";
}

/**
 * Attribute a program to a video from the titles of playlists containing it.
 * Curated programs (فرات، قابل توجه، مشاور ۱، ...) win; otherwise the
 * first playlist title cleaned. Empty → "سایر".
 */
export function programForPlaylists(titles: string[]): string {
  for (const { match, program } of CURATED_PROGRAMS) {
    if (titles.some((t) => match.test(t))) return program;
  }
  const first = titles.find((t) => t.trim().length > 0);
  return first ? cleanProgramTitle(first) : "سایر";
}
