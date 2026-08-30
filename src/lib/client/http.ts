/** Shared client helpers — all browser fetches should use these for API calls. */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") ?? "";
  // Nginx 502/503 during deploys returns text/html — turn the cryptic SyntaxError into Persian.
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    if (text.trimStart().startsWith("<")) {
      throw new Error("سرور موقتاً در دسترس نیست؛ چند لحظه بعد دوباره تلاش کنید.");
    }
    throw new Error(text.slice(0, 200) || "پاسخ نامعتبر از سرور.");
  }
  return (await res.json()) as T;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ res: Response; body: T }> {
  const res = await fetch(url, init);
  const body = await parseJsonResponse<T>(res);
  return { res, body };
}
