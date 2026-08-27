import ytdl from "ytdl-core";

export async function get360pUrl(videoId: string): Promise<string> {
  const info = await ytdl.getInfo(videoId);
  const mp4WithAv = info.formats.filter(
    (f) => f.container === "mp4" && f.hasVideo && f.hasAudio,
  );
  // Sort descending by height, find first with height <=360 (nearest lower or exact)
  const sorted = [...mp4WithAv].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const preferred = sorted.find((f) => (f.height ?? 0) <= 360);
  const fallback = info.formats.find((f) => f.height === 360);
  const fmt = preferred ?? fallback;
  if (!fmt?.url) throw new Error("360p not found");
  return fmt.url;
}
