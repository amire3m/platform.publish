// Client-safe helper: route YouTube/Google-hosted images through our own
// /api/thumb proxy. Direct i.ytimg.com / ggpht.com loads hang on Iranian
// networks and stall page rendering — the proxy serves from server disk cache.

const PROXIABLE_HOSTS = new Set([
  "i.ytimg.com",
  "i9.ytimg.com",
  "yt3.ggpht.com",
  "lh3.googleusercontent.com",
]);

export function isProxiableImageUrl(src: string | null | undefined): boolean {
  if (!src || !/^https:\/\//i.test(src)) return false;
  try {
    return PROXIABLE_HOSTS.has(new URL(src).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Rewrite a remote thumbnail URL to the local proxy; local/data URLs pass through.
 *  Pass w (px) to get a resized variant — much smaller on slow links. */
export function thumbUrl(src: string | null | undefined, w?: number): string | null {
  if (!src) return null;
  if (!isProxiableImageUrl(src)) return src;
  const width = w != null && Number.isFinite(w) ? Math.min(1280, Math.max(32, Math.round(w))) : null;
  return `/api/thumb?u=${encodeURIComponent(src)}${width ? `&w=${width}` : ""}`;
}
