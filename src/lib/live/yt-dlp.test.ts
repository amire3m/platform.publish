import { describe, expect, it } from "vitest";
import {
  buildFormatSelector,
  buildFfmpegArgs,
  extractVideoId,
  maskTarget,
  normalizePlaylistUrl,
  parseFfmpegTime,
  parsePlaylistLine,
} from "./yt-dlp";

describe("yt-dlp helpers", () => {
  it("builds passthrough format selectors", () => {
    expect(buildFormatSelector("1080")).toBe("137+140/136+140/18");
    expect(buildFormatSelector("720")).toBe("136+140/18");
  });

  it("builds ffmpeg args per mode", () => {
    const inputs = ["https://v", "https://a"];
    const encode = buildFfmpegArgs(inputs, "rtmp://t/K", "720");
    expect(encode).toContain("-c:v");
    expect(encode).toContain("libx264");
    expect(encode).toContain("ultrafast");
    expect(encode.join(" ")).toContain("expr:gte(t,n_forced*2)");
    expect(encode.slice(-3)).toEqual(["-f", "flv", "rtmp://t/K"]);
    const copy = buildFfmpegArgs(inputs, "rtmp://t/K", "1080");
    expect(copy).toContain("-c");
    expect(copy).toContain("copy");
    expect(copy).not.toContain("libx264");
  });

  it("adds overlay via filter_complex only in encode mode", () => {
    const overlay = { logoPath: "/opt/logo.png", position: "top-right" as const, opacity: 0.8 };
    const withOverlay = buildFfmpegArgs(["https://v", "https://a"], "rtmp://t/K", "720", overlay);
    const joined = withOverlay.join(" ");
    expect(joined).toContain("filter_complex");
    expect(joined).toContain("colorchannelmixer=aa=0.8");
    expect(joined).toContain("W-w-10:10");
    expect(joined).toContain("-map");
    // passthrough ignores overlay
    const copy = buildFfmpegArgs(["https://v"], "rtmp://t/K", "1080", overlay);
    expect(copy.join(" ")).not.toContain("filter_complex");
  });

  it("extracts video ids from urls and raw ids", () => {
    expect(extractVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1s")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://example.com/nope")).toBeNull();
  });

  it("parses flat playlist lines", () => {
    const item = parsePlaylistLine("dQw4w9WgXcQ\tSome Title\t213.089");
    expect(item).toEqual({ videoId: "dQw4w9WgXcQ", title: "Some Title", durationSec: 213 });
    expect(parsePlaylistLine("NA\tNA\tNA")).toBeNull();
    expect(parsePlaylistLine("")).toBeNull();
  });

  it("parses ffmpeg time lines", () => {
    expect(parseFfmpegTime("frame= 100 fps=25 time=00:03:25.50")).toBe(205.5);
    expect(parseFfmpegTime("time=1:02:03.00 bitrate=3000kbits/s")).toBe(3723);
    expect(parseFfmpegTime("no time here")).toBeNull();
  });

  it("masks stream key in target", () => {
    expect(maskTarget("rtmp://a.rtmp.youtube.com/live2/SECRET-KEY")).toBe("rtmp://a.rtmp.youtube.com/live2/***");
    expect(maskTarget("nokey")).toBe("***");
  });

  it("normalizes playlist input", () => {
    expect(normalizePlaylistUrl("PLabc123def456ghijkl")).toBe("https://www.youtube.com/playlist?list=PLabc123def456ghijkl");
    expect(normalizePlaylistUrl("https://www.youtube.com/playlist?list=PLxyz")).toBe("https://www.youtube.com/playlist?list=PLxyz");
  });
});
