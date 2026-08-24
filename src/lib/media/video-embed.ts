const VIDEO_ID = /^[A-Za-z0-9_-]{6,}$/;

export function getVideoEmbedUrl(platform: string, permalink: string | null | undefined): string | null {
  if (!permalink) return null;

  let url: URL;
  try {
    url = new URL(permalink);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (platform === "youtube") {
    let videoId: string | null = null;
    if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      videoId = url.searchParams.get("v");
      if (!videoId) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(parts[0])) videoId = parts[1] ?? null;
      }
    }
    return videoId && VIDEO_ID.test(videoId) ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
  }

  if (platform === "instagram" && (host === "instagram.com" || host.endsWith(".instagram.com"))) {
    const parts = url.pathname.split("/").filter(Boolean);
    const kind = parts[0];
    const shortcode = parts[1];
    if (["reel", "p", "tv"].includes(kind) && shortcode && VIDEO_ID.test(shortcode)) {
      return `https://www.instagram.com/${kind}/${shortcode}/embed/`;
    }
  }

  return null;
}
