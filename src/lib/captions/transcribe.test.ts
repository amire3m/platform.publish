import { describe, expect, it, vi } from "vitest";

import { buildCaptionPrompt, runTranscription } from "./transcribe";

function stubDeps(overrides: Record<string, unknown> = {}) {
  return {
    downloadFile: vi.fn().mockResolvedValue(Buffer.from("video-bytes")),
    probeDuration: vi.fn().mockResolvedValue(1300),
    extractWav: vi.fn().mockImplementation(async (_b: Buffer, start: number, end: number) => Buffer.from(`wav:${start}-${end}`)),
    stt: {
      transcribe: vi.fn().mockImplementation(async (wav: Buffer) => {
        const label = wav.toString();
        return { text: `text@${label}`, segments: [{ start: 0, end: 5, text: `text@${label}` }], model: "stub" };
      }),
    },
    saveProgress: vi.fn().mockResolvedValue(undefined),
    persist: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runTranscription", () => {
  it("chunks long audio and merges offsets", async () => {
    const deps = stubDeps();
    const out = await runTranscription(deps as never, { maxMinutes: 60 });
    expect(deps.extractWav).toHaveBeenCalledTimes(3);
    expect(deps.persist).toHaveBeenCalledTimes(1);
    const saved = (deps.persist as ReturnType<typeof vi.fn>).mock.calls[0][0] as { segments: Array<{ start: number }> };
    expect(saved.segments.map((s) => s.start)).toEqual([0, 570, 1140]);
    expect(out).toEqual({ segments: 3 });
  });

  it("rejects audio over the cap", async () => {
    const deps = stubDeps({ probeDuration: vi.fn().mockResolvedValue(7200) });
    await expect(runTranscription(deps as never, { maxMinutes: 60 })).rejects.toMatchObject({ code: "TRANSCRIBE_TOO_LONG" });
    expect(deps.extractWav).not.toHaveBeenCalled();
  });
});

describe("buildCaptionPrompt", () => {
  it("includes title, channel and transcript as JSON instruction", () => {
    const p = buildCaptionPrompt({ title: "T", channel: "C", transcript: "hello world" });
    expect(p).toContain("T");
    expect(p).toContain("hello world");
    expect(p).toContain("youtube");
    expect(p).toContain("instagram");
  });
});
