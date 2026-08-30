import { describe, expect, it } from "vitest";
import {
  buildSceneFilter,
  buildSceneArgs,
  parseScenes,
  findScene,
  type Scene,
  type SceneItem,
} from "./scene";

const logo: SceneItem = { kind: "image", value: "/opt/logo.png", position: "top-right", opacity: 0.8, scale: 0.18 };
const pip: SceneItem = { kind: "pip", value: "https://tv/x.m3u8", position: "bottom-left", scale: 0.33 };
const text: SceneItem = { kind: "text", value: "LIVE 12:34", position: "top-left" };
const bareText: SceneItem = { kind: "text", value: "a:b'c", position: "bottom-right" };

const full: Scene = { name: "Full", items: [logo, pip, text] };

describe("buildSceneFilter", () => {
  it("chains scale + overlays + drawtext with correct labels and input indexes", () => {
    const built = buildSceneFilter(full.items, 1);
    expect(built).not.toBeNull();
    const f = built!.filter;
    // base scale
    expect(f).toContain("[0:v]scale=-2:720[base]");
    // logo is input 1 (after main video), pip is input 2
    expect(f).toContain("[1:v]scale=230:-1,format=rgba,colorchannelmixer=aa=0.80[ov0]");
    expect(f).toContain("[base][ov0]overlay=W-w-10:10[cur0]");
    expect(f).toContain("[2:v]scale=422:-2[pf1]");
    expect(f).toContain("[cur0][pf1]overlay=10:H-h-10[cur1]");
    // text needs no input; drawtext on current
    expect(f).toContain("drawtext=text='LIVE 12\\:34'");
    expect(built!.finalLabel).toBe("cur2");
    expect(built!.extraInputCount).toBe(2);
  });

  it("returns null for empty scenes", () => {
    expect(buildSceneFilter([], 1)).toBeNull();
  });

  it("clamps scale and opacity", () => {
    const built = buildSceneFilter([{ kind: "image", value: "/x.png", position: "top-left", scale: 5, opacity: 9 }], 1)!;
    expect(built.filter).toContain("scale=1152:-1"); // 0.9 clamp
    expect(built.filter).toContain("aa=1.00");
  });

  it("escapes colons and quotes in text", () => {
    const built = buildSceneFilter([bareText], 1)!;
    expect(built.filter).toContain("text='a\\:bc'");
  });
});

describe("buildSceneArgs", () => {
  it("orders inputs correctly: main, then image (-loop 1), then pip (reconnect)", () => {
    const args = buildSceneArgs(["https://v", "https://a"], "rtmp://t/K", full);
    const joined = args.join(" ");
    const iLogo = args.indexOf("/opt/logo.png");
    const iPip = args.indexOf("https://tv/x.m3u8");
    const iVid = args.indexOf("https://v");
    expect(iVid).toBeLessThan(iLogo);
    expect(iLogo).toBeLessThan(iPip);
    expect(args[args.indexOf("-loop") + 1]).toBe("1");
    expect(joined).toContain("-reconnect 1");
    // audio map: main inputs = 2 → audio from 1:a
    expect(joined).toContain("-map 1:a");
    expect(args.slice(-3)).toEqual(["-f", "flv", "rtmp://t/K"]);
  });

  it("falls back to plain scale when scene has no valid items", () => {
    const args = buildSceneArgs(["https://v"], "rtmp://t/K", { name: "Empty", items: [] });
    expect(args).toContain("-vf");
    expect(args).not.toContain("-filter_complex");
  });
});

describe("parseScenes", () => {
  it("keeps configured scenes and validates active name", () => {
    const { scenes, activeName } = parseScenes({
      scenes: [full, { name: "Plain", items: [] }],
      activeSceneName: "Missing",
    });
    expect(scenes).toHaveLength(2);
    expect(activeName).toBe("Full");
    expect(findScene(scenes, "Plain")?.name).toBe("Plain");
    expect(findScene(scenes, "Nope")).toBeNull();
  });

  it("migrates legacy single-logo config into a default scene", () => {
    const { scenes, activeName } = parseScenes({ logoPath: "/opt/old.png", position: "top-right", opacity: 0.7 });
    expect(scenes).toHaveLength(1);
    expect(scenes[0].items[0]).toMatchObject({ kind: "image", value: "/opt/old.png", opacity: 0.7 });
    expect(activeName).toBe(scenes[0].name);
  });

  it("returns empty for no config", () => {
    expect(parseScenes(undefined)).toEqual({ scenes: [], activeName: null });
    expect(parseScenes({})).toEqual({ scenes: [], activeName: null });
  });
});
