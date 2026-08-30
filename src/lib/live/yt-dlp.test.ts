import { describe, expect, it } from "vitest";
import {
  buildFormatSelector,
  buildFfmpegArgs,
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
