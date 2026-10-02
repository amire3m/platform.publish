/* EmRo lightweight service worker — repeat-visit speed on slow links.
 * - Immutable app assets (/_next/static/*) + proxied thumbs: cache-first.
 * - HTML navigations + APIs: network-only (always fresh auth/data), with a
 *   tiny offline fallback page for navigations when the network is gone.
 * - Versioned cache; old versions purged on activate. Bump V on big releases.
 */
const V = "emro-v2026-10-02";
const STATIC_CACHE = `${V}-static`;
const STATIC_RE = /\/_next\/static\//;
const THUMB_RE = /\/api\/thumb\?/;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function offlinePage() {
  return new Response(
    "<!doctype html><html dir='rtl' lang='fa'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>قطع ارتباط</title><body style='font-family:Tahoma,sans-serif;text-align:center;padding:48px;background:#17212b;color:#fff'><h1>اتصال برقرار نیست</h1><p>اینترنت را بررسی کنید و دوباره تلاش کنید.</p><a href='/' style='color:#7dd3fc'>تلاش دوباره</a></body></html>",
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (STATIC_RE.test(url.pathname) || THUMB_RE.test(url.pathname + url.search)) {
    // Hashed URLs are immutable — serve cache, update in background.
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      })(),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => offlinePage()));
  }
});
