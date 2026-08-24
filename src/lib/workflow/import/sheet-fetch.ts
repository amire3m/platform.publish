export interface PublicSheetRef {
  sheetId: string;
  gid: string;
}

const ALLOWED_HOST = "docs.google.com";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

const INVALID_URL_MESSAGE = "آدرس صفحه‌گسترده Google معتبر نیست.";
const REDIRECT_MESSAGE = "مسیر انتقال صفحه‌گسترده Google مجاز نیست.";
const SIZE_MESSAGE = "حجم فایل بیش از حد مجاز است";
const FETCH_FAILED_MESSAGE = "دریافت صفحه‌گسترده Google ناموفق بود. از عمومی‌بودن صفحه‌گسترده مطمئن شوید و دوباره تلاش کنید.";

export function parsePublicSheetUrl(urlString: string): PublicSheetRef {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(INVALID_URL_MESSAGE);
  }

  if (url.hostname !== ALLOWED_HOST) {
    throw new Error(INVALID_URL_MESSAGE);
  }

  if (url.protocol !== "https:") {
    throw new Error(INVALID_URL_MESSAGE);
  }

  const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error(INVALID_URL_MESSAGE);
  }
  const sheetId = match[1];

  let gid: string | null = null;

  // hash fragment like #gid=42
  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.slice(1));
    gid = hashParams.get("gid");
  }
  if (!gid) {
    gid = url.searchParams.get("gid");
  }
  if (!gid) {
    gid = "0";
  }

  // validate gid is digits (allow 0)
  // keep as string; ensure it's not empty
  if (!gid) gid = "0";

  return { sheetId, gid };
}

export function buildSheetCsvUrl(ref: PublicSheetRef): string {
  // sheetId is validated to be alphanumeric + - _
  // encode to be safe but keep id as is
  const sheetId = encodeURIComponent(ref.sheetId);
  const gid = encodeURIComponent(ref.gid);
  return `https://${ALLOWED_HOST}/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export interface SheetFetchDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  // Prefer streaming if body is available
  const body = response.body as ReadableStream<Uint8Array> | null;
  if (body && typeof (body as unknown as { getReader?: unknown }).getReader === "function") {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let result = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.byteLength;
          if (received > maxBytes) {
            // cancel reading
            try {
              await reader.cancel();
            } catch {
              // ignore
            }
            throw new Error(`${SIZE_MESSAGE} (۵ مگابایت)`);
          }
          result += decoder.decode(value, { stream: true });
        }
      }
      result += decoder.decode();
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
    // Double-check total encoded size (in case of multi-byte chars)
    const totalBytes = new TextEncoder().encode(result).byteLength;
    if (totalBytes > maxBytes) {
      throw new Error(`${SIZE_MESSAGE} (۵ مگابایت)`);
    }
    return result;
  }

  // Fallback: use text() / arrayBuffer()
  // Use arrayBuffer if available to get accurate byte count first
  if (typeof response.arrayBuffer === "function") {
    try {
      const buf = await response.arrayBuffer();
      if (buf.byteLength > maxBytes) {
        throw new Error(`${SIZE_MESSAGE} (۵ مگابایت)`);
      }
      return new TextDecoder().decode(buf);
    } catch (e) {
      if (e instanceof Error && e.message.includes(SIZE_MESSAGE)) throw e;
      // fall through to text()
    }
  }

  const text = await response.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) {
    throw new Error(`${SIZE_MESSAGE} (۵ مگابایت)`);
  }
  return text;
}

export async function fetchSheetCsv(ref: PublicSheetRef, deps?: SheetFetchDeps): Promise<string> {
  const fetchImpl: typeof fetch = deps?.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = deps?.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = deps?.maxBytes ?? MAX_BYTES;
  const maxRedirects = deps?.maxRedirects ?? MAX_REDIRECTS;

  let currentUrl = buildSheetCsvUrl(ref);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let redirects = 0;
    while (true) {
      let response: Response;
      try {
        response = await fetchImpl(currentUrl, {
          redirect: "manual",
          signal: controller.signal,
        } as RequestInit);
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          throw new Error("زمان دریافت صفحه‌گسترده Google به پایان رسید. دوباره تلاش کنید.");
        }
        // Do not leak URL
        throw new Error(FETCH_FAILED_MESSAGE);
      }

      if (isRedirect(response.status)) {
        const location = response.headers.get("location") ?? response.headers.get("Location");
        if (!location) {
          throw new Error(REDIRECT_MESSAGE);
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          throw new Error(REDIRECT_MESSAGE);
        }
        if (nextUrl.hostname !== ALLOWED_HOST) {
          throw new Error(REDIRECT_MESSAGE);
        }
        redirects += 1;
        if (redirects > maxRedirects) {
          throw new Error(REDIRECT_MESSAGE);
        }
        currentUrl = nextUrl.toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(FETCH_FAILED_MESSAGE);
      }

      // Success – read bounded body
      try {
        const text = await readLimitedBody(response, maxBytes);
        return text;
      } catch (e) {
        if (e instanceof Error && e.message.includes(SIZE_MESSAGE)) throw e;
        // bounded read other errors -> generic
        throw new Error(FETCH_FAILED_MESSAGE);
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}
