import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "i.ytimg.com",
  "i9.ytimg.com",
  "yt3.ggpht.com",
  "lh3.googleusercontent.com",
]);
const MAX_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

function cacheDir(): string {
  return process.env.THUMB_CACHE_DIR || join(process.cwd(), ".data", "thumb-cache");
}

function cachePath(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return join(cacheDir(), `${hash}.bin`);
}

function metaPath(url: string): string {
  return `${cachePath(url)}.meta.json`;
}

// GET /api/thumb?u=<encoded https url> — public (used by the public homepage),
// strictly limited to YouTube/Google image hosts with disk cache.
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const src = url.searchParams.get("u");
  if (!src) return new Response("missing url", { status: 400 });
  let host: string;
  try {
    const parsed = new URL(src);
    if (parsed.protocol !== "https:") return new Response("https only", { status: 400 });
    host = parsed.hostname.toLowerCase();
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(host)) return new Response("host not allowed", { status: 403 });

  // Disk cache hit
  try {
    const [buf, metaRaw] = await Promise.all([readFile(cachePath(src)), readFile(metaPath(src), "utf-8")]);
    const meta = JSON.parse(metaRaw) as { contentType: string };
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": meta.contentType || "image/jpeg",
        "cache-control": "public, max-age=604800, immutable",
      },
    });
  } catch {}

  // Fetch upstream with timeout + size cap
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(src, { signal: controller.signal, redirect: "follow" });
    if (!upstream.ok || !upstream.body) return new Response("upstream failed", { status: 502 });
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return new Response("not an image", { status: 502 });

    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        try { await reader.cancel(); } catch {}
        return new Response("too large", { status: 502 });
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    try {
      await mkdir(cacheDir(), { recursive: true });
      await Promise.all([
        writeFile(cachePath(src), buf),
        writeFile(metaPath(src), JSON.stringify({ contentType }), "utf-8"),
      ]);
    } catch {}
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: { "content-type": contentType, "cache-control": "public, max-age=604800, immutable" },
    });
  } catch {
    // Stale cache fallback if upstream fails after we cached before (already tried above)
    try {
      await stat(cachePath(src));
      return new Response("upstream failed", { status: 502 });
    } catch {}
    return new Response("upstream failed", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
