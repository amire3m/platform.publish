import type { TranscriptSegment } from "./srt";
import { ElevenLabsSttProvider } from "./stt-elevenlabs";

export interface SttResult {
  text: string;
  segments: TranscriptSegment[];
  model: string;
}

export interface SttProvider {
  transcribe(wav: Buffer, opts?: { language?: string }): Promise<SttResult>;
}

export interface CaptionResult {
  youtube: string;
  instagram: string;
  model: string;
}

export interface CaptionInput {
  title: string;
  channel: string;
  transcript: string;
  prompt: string;
}

export interface CaptionProvider {
  generate(input: CaptionInput): Promise<CaptionResult>;
}

function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class RemoteSttProvider implements SttProvider {
  constructor(
    private baseUrl: string,
    private token = "",
    private timeoutMs = Number(process.env.AI_BOX_TIMEOUT_MS ?? 120000),
  ) {}

  async transcribe(wav: Buffer, opts?: { language?: string }): Promise<SttResult> {
    const body = new FormData();
    body.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
    body.append("language", opts?.language ?? "fa");
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/transcribe`, {
      method: "POST",
      headers: authHeaders(this.token),
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`STT request failed with status ${res.status}`);
    const data = (await res.json()) as { text?: string; segments?: TranscriptSegment[]; model?: string };
    return {
      text: data.text ?? "",
      segments: Array.isArray(data.segments) ? data.segments : [],
      model: data.model ?? "remote",
    };
  }
}

export class RemoteCaptionProvider implements CaptionProvider {
  constructor(
    private baseUrl: string,
    private token = "",
    private model = "local-fa",
    private timeoutMs = Number(process.env.AI_BOX_TIMEOUT_MS ?? 120000),
  ) {}

  async generate(input: CaptionInput): Promise<CaptionResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(this.token) },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: input.prompt }],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Caption request failed with status ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: { youtube?: string; instagram?: string } = {};
    try {
      parsed = JSON.parse(content) as { youtube?: string; instagram?: string };
    } catch {
      parsed = { youtube: content, instagram: content };
    }
    return {
      youtube: parsed.youtube ?? "",
      instagram: parsed.instagram ?? "",
      model: data.model ?? this.model,
    };
  }
}

export class FakeSttProvider implements SttProvider {
  async transcribe(_wav: Buffer): Promise<SttResult> {
    const segments = [
      { start: 0, end: 4, text: "این یک رونوشت نمایشی است." },
      { start: 4, end: 8, text: "برای خروجی واقعی AI_BOX_URL را تنظیم کنید." },
    ];
    return { text: segments.map((s) => s.text).join(" "), segments, model: "fake" };
  }
}

export class FakeCaptionProvider implements CaptionProvider {
  async generate(input: CaptionInput): Promise<CaptionResult> {
    return {
      youtube: `یوتیوب: ${input.title}`,
      instagram: `اینستاگرام: ${input.title}`,
      model: "fake",
    };
  }
}

export function getProviders(): { stt: SttProvider; captions: CaptionProvider } {
  const elevenKey = (process.env.ELEVENLABS_API_KEY ?? "").trim();
  const boxBase = (process.env.AI_BOX_URL ?? "").trim();
  const boxToken = process.env.AI_BOX_TOKEN ?? "";
  const llmBase = (process.env.CAPTION_LLM_BASE ?? "").trim();
  const llmKey = (process.env.CAPTION_LLM_KEY ?? "").trim();
  const llmModel = (process.env.CAPTION_LLM_MODEL ?? "local-fa").trim() || "local-fa";

  let stt: SttProvider;
  if (elevenKey) {
    stt = new ElevenLabsSttProvider(elevenKey);
  } else if (boxBase) {
    stt = new RemoteSttProvider(boxBase, boxToken);
  } else {
    stt = new FakeSttProvider();
  }

  let captions: CaptionProvider;
  if (llmBase && llmKey) {
    captions = new RemoteCaptionProvider(llmBase, llmKey, llmModel);
  } else {
    captions = new FakeCaptionProvider();
  }
  return { stt, captions };
}
