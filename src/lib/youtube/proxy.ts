import play from "play-dl";

export async function get360pUrl(videoId: string): Promise<string> {
  const info = await play.video_info(`https://www.youtube.com/watch?v=${videoId}`);
  const formats = info.format as unknown as Array<{ height?: number; url: string; mimeType?: string }>;
  const candidates = formats.filter((f) => f.url);
  const withHeight = candidates.filter((f) => typeof f.height === "number");
  const sorted = [...withHeight].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const preferred = sorted.find((f) => (f.height ?? 0) <= 360 && (f.height ?? 0) > 0) ?? sorted.find((f) => f.height === 360);
  const fallback = candidates[0];
  const fmt = preferred ?? fallback;
  if (!fmt?.url) throw new Error("360p not found");
  return fmt.url;
}
