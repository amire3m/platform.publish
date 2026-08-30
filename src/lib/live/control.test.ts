import { describe, expect, it, vi } from "vitest";
import { PlaylistStreamer } from "./playlist-streamer";
import { dispatchControl } from "./control";
import type { LiveStreamerDeps } from "./playlist-streamer";

function makeStreamer(deps: Partial<LiveStreamerDeps> = {}, items: Array<{ videoId: string; title: string; durationSec: number | null }> = []) {
  const base: LiveStreamerDeps = {
    fetchItems: vi.fn().mockResolvedValue(items),
    fetchUrls: vi.fn().mockResolvedValue({ videoUrl: "https://v", audioUrl: null }),
    spawnFfmpeg: vi.fn().mockReturnValue({ stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn() }),
    onEvent: vi.fn(),
    fetchMeta: vi.fn().mockResolvedValue({ videoId: "addedVid123", title: "A", durationSec: 5 }),
    ...deps,
  };
  return new PlaylistStreamer(base);
}

describe("dispatchControl", () => {
  it("rejects unknown actions", async () => {
    const res = await dispatchControl(makeStreamer(), { action: "x" });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("stop on idle returns 409", async () => {
    const res = await dispatchControl(makeStreamer(), { action: "stop" });
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("add requires input and resolves metadata", async () => {
    const streamer = makeStreamer({}, [{ videoId: "vid1playing", title: "P", durationSec: 1 }]);
    await streamer.start({ playlistInput: "PL", rtmpUrl: "rtmp://x", streamKey: "K", loop: true });
    const bad = await dispatchControl(streamer, { action: "add" });
    expect(bad).toMatchObject({ ok: false, status: 422 });
    const good = await dispatchControl(streamer, { action: "add", input: "https://youtu.be/addedVid123" });
    expect(good.ok).toBe(true);
  });

  it("remove/move/replay validate inputs", async () => {
    const streamer = makeStreamer({}, [{ videoId: "vid1playing", title: "P", durationSec: 1 }]);
    await streamer.start({ playlistInput: "PL", rtmpUrl: "rtmp://x", streamKey: "K", loop: true });
    expect(await dispatchControl(streamer, { action: "move", videoId: "vid1playing" })).toMatchObject({ ok: false, status: 422 });
    expect(await dispatchControl(streamer, { action: "remove", videoId: "vid1playing" })).toMatchObject({ ok: false, status: 409 });
    expect(await dispatchControl(streamer, { action: "replay", videoId: "missing123" })).toMatchObject({ ok: false, status: 409 });
  });
});
