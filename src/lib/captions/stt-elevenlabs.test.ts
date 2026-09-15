import { describe, expect, it, vi, afterEach } from "vitest";

import { ElevenLabsSttProvider } from "./stt-elevenlabs";

const WORDS = [
  { text: "سلام", start: 0, end: 0.5, type: "word" },
  { text: "دنیا.", start: 0.6, end: 1.0, type: "word" },
  { text: "حال", start: 5, end: 5.4, type: "word" },
  { text: "شما", start: 5.5, end: 5.9, type: "word" },
  { text: "چطور", start: 6, end: 6.4, type: "word" },
  { text: "است؟", start: 6.5, end: 7.0, type: "word" },
];

describe("ElevenLabsSttProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts scribe_v2 with Persian language and groups words into segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "x", language_code: "fas", words: WORDS }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const stt = new ElevenLabsSttProvider("test-key");
    const r = await stt.transcribe(Buffer.from("x"));
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: FormData }];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(init.method).toBe("POST");
    expect(init.headers["xi-api-key"]).toBe("test-key");
    expect(init.body.get("model_id")).toBe("scribe_v2");
    expect(init.body.get("language_code")).toBe("fas");
    expect(r.model).toContain("scribe");
    expect(r.segments).toEqual([
      { start: 0, end: 1.0, text: "سلام دنیا." },
      { start: 5, end: 7.0, text: "حال شما چطور است؟" },
    ]);
    expect(r.text).toBe("سلام دنیا. حال شما چطور است؟");
  });

  it("skips non-word tokens when grouping", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "x",
        words: [
          { text: "سلام", start: 0, end: 0.5, type: "word" },
          { text: "(خنده)", start: 0.6, end: 1.0, type: "audio_event" },
          { text: "دنیا", start: 1.1, end: 1.5, type: "word" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const stt = new ElevenLabsSttProvider("test-key");
    const r = await stt.transcribe(Buffer.from("x"));
    expect(r.segments).toEqual([{ start: 0, end: 1.5, text: "سلام دنیا" }]);
  });

  it("throws precise errors on API failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: [{ msg: "invalid key" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const stt = new ElevenLabsSttProvider("bad-key");
    await expect(stt.transcribe(Buffer.from("x"))).rejects.toThrow("invalid key");
  });
});
