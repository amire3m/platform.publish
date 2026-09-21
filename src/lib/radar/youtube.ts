import { Innertube } from "youtubei.js";

export interface ExternalVideo {
  externalId: string;
  title: string;
  channel: string;
  views: number | null;
  publishedAt: Date | null;
  thumbUrl: string | null;
  permalink: string;
}

export async function searchYouTube(query: string, limit = 10): Promise<ExternalVideo[]> {
  try {
    const yt = await Innertube.create({ generate_session_locally: true });
    const res = await yt.search(query, { type: "video" });
    const videos = (res as unknown as { results?: unknown[] }).results ?? (res as unknown as { videos?: unknown[] }).videos ?? [];
    // Fallback: use the typed helper if available
    const items: ExternalVideo[] = [];
    const raw = (res as unknown as { results?: unknown }).results ?? res;
    // youtubei.js search returns a Search object with .results array of Video objects
    const list = Array.isArray((raw as { results?: unknown[] }).results) ? (raw as { results: unknown[] }).results : Array.isArray(res) ? (res as unknown[]) : [];
    // Try to iterate generically
    const candidates = list.length ? list : (Array.isArray((res as unknown as { videos?: unknown[] }).videos) ? (res as unknown as { videos: unknown[] }).videos : []);
    // If still empty, try to parse via search contents
    const searchAny = res as unknown as Record<string, unknown>;
    const fallback = (searchAny.results ?? searchAny.contents ?? searchAny.videos ?? []) as unknown[];
    const arr = (fallback as unknown[]).length ? (fallback as unknown[]) : (Array.isArray(res) ? (res as unknown[]) : []);
    for (const v of arr.slice(0, limit)) {
      const o = v as Record<string, unknown>;
      const id = String(o.id ?? o.videoId ?? o.video_id ?? "");
      if (!id) continue;
      const title = String((o.title as { text?: string })?.text ?? o.title ?? "");
      const channel = String((o.author as { name?: string })?.name ?? (o.channel as { name?: string })?.name ?? o.channelName ?? "");
      const viewsRaw = (o.view_count ?? o.views ?? o.viewCount) as string | number | undefined;
      const views = viewsRaw != null ? Number(String(viewsRaw).replace(/[^0-9]/g, "")) || null : null;
      items.push({
        externalId: id,
        title: title.slice(0, 200) || id,
        channel: channel.slice(0, 120),
        views: Number.isFinite(views as number) ? (views as number) : null,
        publishedAt: null,
        thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        permalink: `https://www.youtube.com/watch?v=${id}`,
      });
      if (items.length >= limit) break;
    }
    // If parsing failed, return a minimal demo item so the run is not empty (best-effort)
    if (!items.length) {
      // Try alternative: use search helper that returns videos directly
      try {
        const search2 = await yt.search(query);
        const alt = (search2 as unknown as { videos?: Array<Record<string, unknown>> }).videos ?? [];
        for (const v of alt.slice(0, limit)) {
          const id = String(v.id ?? v.videoId ?? "");
          if (!id) continue;
          items.push({ externalId: id, title: String(v.title ?? id).slice(0, 200), channel: String((v.author as { name?: string })?.name ?? ""), views: null, publishedAt: null, thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, permalink: `https://www.youtube.com/watch?v=${id}` });
        }
      } catch {}
    }
    return items;
  } catch {
    return [];
  }
}
