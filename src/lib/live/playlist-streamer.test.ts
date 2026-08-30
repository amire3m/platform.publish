import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { PlaylistStreamer, type LiveStreamerDeps } from "./playlist-streamer";
import type { Readable } from "node:stream";

function fakeProcess(): { proc: ReturnType<typeof makeProc>; close: (code: number | null) => void } {
  return makeProc();
}

function makeProc() {
  const proc = new EventEmitter() as unknown as {
    stderr: Readable;
    on: (ev: string, cb: (...args: unknown[]) => void) => void;
    kill: (sig?: string) => void;
    close: (code: number | null) => void;
    killed: boolean;
  };
  const emitter = proc as unknown as EventEmitter;
  (proc as unknown as { stderr: Readable }).stderr = new EventEmitter() as unknown as Readable;
  let killCount = 0;
  (proc as unknown as { kill: (sig?: string) => void }).kill = () => {
    killCount += 1;
    return true;
  };
  const handle = {
    proc: proc as unknown as never,
    close: (code: number | null) => emitter.emit("close", code),
    killCount: () => killCount,
  };
  return handle;
}

function makeDeps(items: Array<{ videoId: string; title: string; durationSec: number | null }>) {
  const procs: ReturnType<typeof makeProc>[] = [];
  const deps: LiveStreamerDeps = {
    fetchItems: vi.fn().mockResolvedValue(items),
    fetchUrls: vi.fn().mockImplementation(async (videoId: string) => ({
      videoUrl: `https://example.com/${videoId}/video`,
      audioUrl: `https://example.com/${videoId}/audio`,
    })),
    spawnFfmpeg: vi.fn().mockImplementation(() => {
      const p = makeProc();
      procs.push(p);
      return p.proc;
    }),
    onEvent: vi.fn(),
    now: () => Date.now(),
  };
  return { deps, procs };
}

const ITEMS = [
  { videoId: "vid1", title: "First", durationSec: 10 },
  { videoId: "vid2", title: "Second", durationSec: 20 },
];

describe("PlaylistStreamer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  // Note: not restoring fake timers — each test creates its own streamer instance.

  it("starts a session and marks the first item as playing", async () => {
    const { deps, procs } = makeDeps(ITEMS);
    const streamer = new PlaylistStreamer(deps);
    const session = await streamer.start({ playlistInput: "PLtest", rtmpUrl: "rtmp://x/live", streamKey: "KEY", loop: false });
    expect(session.state).toBe("live");
    expect(session.queue).toHaveLength(2);
    expect(session.queue[0].status).toBe("playing");
    expect(deps.spawnFfmpeg).toHaveBeenCalledTimes(1);
    const pub = streamer.toPublic();
    expect(pub.rtmpTarget).toBe("rtmp://x/live/***");
    expect(pub.isActive).toBe(true);
    // finish first video → second starts
    procs[0].close(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(session.queue[0].status).toBe("done");
    expect(session.queue[1].status).toBe("playing");
    // finish second → non-loop session stops
    procs[1].close(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(session.state).toBe("stopped");
    expect(streamer.toPublic().isActive).toBe(false);
  });

  it("loops the queue when loop is true", async () => {
    const { deps, procs } = makeDeps(ITEMS);
    const streamer = new PlaylistStreamer(deps);
    await streamer.start({ playlistInput: "PLtest", rtmpUrl: "rtmp://x/live", streamKey: "KEY", loop: true });
    procs[0].close(0);
    await vi.advanceTimersByTimeAsync(2000);
    procs[1].close(0);
    await vi.advanceTimersByTimeAsync(2000);
    // loop branch ran (currentIndex reset) → restart scheduled → item 0 playing again
    await vi.advanceTimersByTimeAsync(2000);
    // loop → back to item 0
    expect(sessionOf(streamer).currentIndex).toBe(0);
    expect(sessionOf(streamer).queue[0].status).toBe("playing");
  });

  it("skips the current item", async () => {
    const { deps, procs } = makeDeps(ITEMS);
    const streamer = new PlaylistStreamer(deps);
    await streamer.start({ playlistInput: "PLtest", rtmpUrl: "rtmp://x/live", streamKey: "KEY", loop: false });
    expect(streamer.skip()).toBe(true);
    expect(procs[0].killCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(sessionOf(streamer).queue[0].status).toBe("skipped");
    expect(sessionOf(streamer).queue[1].status).toBe("playing");
  });

  it("stops the session", async () => {
    const { deps, procs } = makeDeps(ITEMS);
    const streamer = new PlaylistStreamer(deps);
    await streamer.start({ playlistInput: "PLtest", rtmpUrl: "rtmp://x/live", streamKey: "KEY", loop: true });
    expect(streamer.stop("manual")).toBe(true);
    expect(procs[0].killCount()).toBe(1);
    expect(sessionOf(streamer).state).toBe("stopped");
    expect(streamer.skip()).toBe(false);
  });

  it("rejects a second session while active", async () => {
    const { deps } = makeDeps(ITEMS);
    const streamer = new PlaylistStreamer(deps);
    await streamer.start({ playlistInput: "PLtest", rtmpUrl: "rtmp://x/live", streamKey: "KEY", loop: false });
    await expect(
      streamer.start({ playlistInput: "PLother", rtmpUrl: "rtmp://x/live", streamKey: "KEY2", loop: false }),
    ).rejects.toThrow("جلسه لایو فعال");
  });

  it("fails fast for an empty playlist", async () => {
    const { deps } = makeDeps([]);
    const streamer = new PlaylistStreamer(deps);
    await expect(
      streamer.start({ playlistInput: "PLempty", rtmpUrl: "rtmp://x/live", streamKey: "KEY", loop: false }),
    ).rejects.toThrow("پلی‌لیست خالی");
    expect(sessionOf(streamer).state).toBe("error");
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sessionOf(streamer: PlaylistStreamer): any {
  // access private session for assertions
  return (streamer as unknown as { session: unknown }).session;
}
