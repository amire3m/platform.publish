export interface VidsUploadStatus {
  status: string;
  file_id?: string;
  progress?: number;
}

export interface VidsFileInfo {
  streamUrl: string | null;
  embedUrl: string | null;
  raw: unknown;
}

export interface VidsCapacity {
  active_remote: number;
  queued_remote: number;
  free_remote: number;
  max_remote: number;
  max_concurrent: number;
}

export class VidsApiError extends Error {
  constructor(
    message: string,
    public readonly action: string,
    public readonly status: number,
    public readonly fromApiPayload = true,
  ) {
    super(message);
    this.name = "VidsApiError";
  }
}

function formBody(params: Record<string, string>): FormData {
  const body = new FormData();
  for (const [k, v] of Object.entries(params)) body.append(k, v);
  return body;
}

function capacityCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

/** Thin client over the vids.st API (upload/url, status, file info/delete, subtitles). */
export class VidsClient {
  constructor(
    private baseUrl = "https://vids.st/api/index.php",
    private apiKey = "",
    private timeoutMs = 60000,
  ) {}

  private async call<T>(action: string, params: Record<string, string> = {}, method: "GET" | "POST" = "POST"): Promise<T> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("action", action);
    const init: RequestInit = {
      method,
      headers: { "X-API-Key": this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (method === "POST") {
      init.body = formBody(params);
    } else {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    let res: Response;
    try {
      res = await fetch(url.toString(), init);
    } catch (err) {
      // Surface the underlying cause (e.g. TLS "unable to verify the first
      // certificate") instead of a bare "fetch failed".
      const cause = (err as { cause?: { message?: string }; message?: string })?.cause?.message
        ?? (err as Error)?.message
        ?? "network error";
      throw new Error(`vids.st request failed (${action}): ${cause}`);
    }
    const data = (await res.json().catch(() => null)) as { status?: number; message?: string; msg?: string; result?: T } | null;
    if (!res.ok || !data || data.status !== 200) {
      const apiStatus = Number(data?.status);
      throw new VidsApiError(
        data?.message || data?.msg || `vids.st request failed (${action}, http ${res.status})`,
        action,
        !res.ok ? res.status : (Number.isFinite(apiStatus) ? apiStatus : res.status),
        res.ok,
      );
    }
    return data.result as T;
  }

  async serverCapacity(): Promise<VidsCapacity> {
    const r = await this.call<Partial<VidsCapacity>>("upload/server", {}, "GET");
    return {
      active_remote: capacityCount(r.active_remote),
      queued_remote: capacityCount(r.queued_remote),
      free_remote: capacityCount(r.free_remote),
      max_remote: capacityCount(r.max_remote),
      max_concurrent: capacityCount(r.max_concurrent),
    };
  }

  async remoteUpload(publicUrl: string): Promise<string> {
    const r = await this.call<{ task_id: string }>("upload/url", { url: publicUrl });
    if (!r.task_id) throw new Error("vids.st did not return a task id");
    return r.task_id;
  }

  async uploadStatus(taskId: string): Promise<VidsUploadStatus> {
    return this.call<VidsUploadStatus>("upload/status", { task_id: taskId }, "GET");
  }

  async fileInfo(fileId: string): Promise<VidsFileInfo> {
    const r = await this.call<{ links?: { stream?: string; embed?: string; player?: string } }>("file/info", { file_id: fileId }, "GET");
    const streamUrl = r.links?.stream ?? r.links?.player ?? r.links?.embed ?? null;
    return { streamUrl, embedUrl: r.links?.embed ?? null, raw: r };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.call("file/delete", { file_id: fileId });
  }

  async uploadSubtitle(videoId: string, label: string, srt: string): Promise<void> {
    const body = new FormData();
    body.append("video_id", videoId);
    body.append("label", label);
    body.append("subtitle", new Blob([srt], { type: "text/plain" }), "fa.srt");
    const url = new URL(this.baseUrl);
    url.searchParams.set("action", "subtitle/upload");
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "X-API-Key": this.apiKey },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = (await res.json().catch(() => null)) as { status?: number; message?: string } | null;
    if (!res.ok || !data || data.status !== 200) {
      throw new Error(data?.message || "vids.st subtitle upload failed");
    }
  }
}

/** In-memory fake for tests and keyless local dev (no network). */
export class FakeVidsClient extends VidsClient {
  private tasks = new Map<string, { url: string; polls: number }>();
  private files = new Map<string, { url: string }>();
  private counter = 0;

  constructor() {
    super("", "");
  }

  override async serverCapacity(): Promise<VidsCapacity> {
    return { active_remote: 0, queued_remote: 0, free_remote: 10, max_remote: 10, max_concurrent: 10 };
  }

  override async remoteUpload(publicUrl: string): Promise<string> {
    const taskId = `T-fake-${++this.counter}`;
    this.tasks.set(taskId, { url: publicUrl, polls: 0 });
    return taskId;
  }

  override async uploadStatus(taskId: string): Promise<VidsUploadStatus> {
    const t = this.tasks.get(taskId);
    if (!t) throw new VidsApiError("Upload task not found", "upload/status", 404);
    t.polls++;
    if (t.polls >= 2) {
      const fileId = `F-fake-${taskId}`;
      this.files.set(fileId, { url: t.url });
      return { status: "done", file_id: fileId, progress: 100 };
    }
    return { status: "uploading", progress: 50 };
  }

  override async fileInfo(fileId: string): Promise<VidsFileInfo> {
    const f = this.files.get(fileId);
    const streamUrl = f ? `https://cdn.fake/${fileId}.mp4` : null;
    return { streamUrl, embedUrl: null, raw: {} };
  }

  override async deleteFile(fileId: string): Promise<void> {
    this.files.delete(fileId);
  }

  override async uploadSubtitle(): Promise<void> {}
}

export function getVidsClient(timeoutMs = 60000): VidsClient {
  const base = (process.env.VIDS_API_BASE ?? "https://vids.st/api/index.php").trim();
  const key = (process.env.VIDS_API_KEY ?? "").trim();
  if (!key) return new FakeVidsClient();
  return new VidsClient(base || "https://vids.st/api/index.php", key, timeoutMs);
}
