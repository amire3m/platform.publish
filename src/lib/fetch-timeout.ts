// Bounded fetch: on stall-prone links a hung request would otherwise keep
// skeletons spinning forever (SWR/fetch have no timeout by default).
// AbortSignal.timeout turns a hang into a catchable error after ms.
export const DEFAULT_API_TIMEOUT_MS = 25_000;

export class FetchTimeoutError extends Error {
  constructor(ms: number) {
    super(`مهلت اتصال تمام شد (${Math.round(ms / 1000)} ثانیه). دوباره تلاش کنید.`);
    this.name = "FetchTimeoutError";
  }
}

export async function timedFetch(url: string, init?: RequestInit, ms = DEFAULT_API_TIMEOUT_MS): Promise<Response> {
  const external = init?.signal;
  if (external) return fetch(url, init);
  const timeout = AbortSignal.timeout(ms);
  try {
    return await fetch(url, { ...init, signal: timeout });
  } catch (e) {
    if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") {
      throw new FetchTimeoutError(ms);
    }
    throw e;
  }
}
