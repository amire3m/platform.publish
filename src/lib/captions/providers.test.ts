import { describe, expect, it, vi, afterEach } from "vitest";

import { FakeCaptionProvider, FakeSttProvider, RemoteCaptionProvider, RemoteSttProvider, getProviders } from "./providers";
import { ElevenLabsSttProvider } from "./stt-elevenlabs";

describe("providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fakes serve local dev without a box", async () => {
    vi.stubEnv("AI_BOX_URL", "");
    const { stt, captions } = getProviders();
    expect(stt).toBeInstanceOf(FakeSttProvider);
    expect(captions).toBeInstanceOf(FakeCaptionProvider);
    const r = await stt.transcribe(Buffer.from("x"));
    expect(r.segments.length).toBeGreaterThan(0);
    const c = await captions.generate({ title: "t", channel: "c", transcript: "x", prompt: "p" });
    expect(c.youtube.length).toBeGreaterThan(0);
  });

  it("remote STT posts wav and parses segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "hello", segments: [{ start: 0, end: 2, text: "hello" }], model: "fa-large" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const remote = new RemoteSttProvider("http://box:8000", "tok");
    const r = await remote.transcribe(Buffer.from("x"));
    expect(fetchMock).toHaveBeenCalledWith("http://box:8000/transcribe", expect.objectContaining({ method: "POST" }));
    expect(r.text).toBe("hello");
  });

  it("prefers ElevenLabs when its key is set", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
    const { stt } = getProviders();
    expect(stt).toBeInstanceOf(ElevenLabsSttProvider);
  });

  it("wires any OpenAI-compatible caption endpoint from env", async () => {
    vi.stubEnv("CAPTION_LLM_BASE", "https://llm.example/v1");
    vi.stubEnv("CAPTION_LLM_KEY", "llm-key");
    vi.stubEnv("CAPTION_LLM_MODEL", "fast-fa");
    const { captions } = getProviders();
    expect(captions).toBeInstanceOf(RemoteCaptionProvider);
  });
});
