import type { SttProvider, SttResult } from "./providers";
import type { TranscriptSegment } from "./srt";

const API_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL_ID = "scribe_v2";
const LANGUAGE_CODE = "fas";

interface ScribeWord {
  text: string;
  start?: number | null;
  end?: number | null;
  type?: string;
}

/** Split words into sentence-like segments (enders, time gaps, or word cap). */
export function groupWordsIntoSegments(
  words: ScribeWord[],
  maxWords = 14,
  maxGapSec = 1.2,
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let current: ScribeWord[] = [];
  const flush = () => {
    if (!current.length) return;
    const starts = current.map((w) => w.start ?? 0);
    const ends = current.map((w) => w.end ?? 0);
    segments.push({
      start: Math.min(...starts),
      end: Math.max(...ends),
      text: current.map((w) => w.text).join(" "),
    });
    current = [];
  };
  for (const w of words) {
    if (w.type && w.type !== "word") continue;
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const gap = (w.start ?? 0) - (prev.end ?? 0);
      const prevText = prev.text;
      if (current.length >= maxWords || gap > maxGapSec || /[.؟?!…]$/.test(prevText)) flush();
    }
    current.push(w);
  }
  flush();
  return segments;
}

/** Persian STT via ElevenLabs Scribe (pay-as-you-go, no box needed). */
export class ElevenLabsSttProvider implements SttProvider {
  constructor(
    private apiKey: string,
    private modelId = MODEL_ID,
    private timeoutMs = Number(process.env.AI_BOX_TIMEOUT_MS ?? 300000),
  ) {}

  async transcribe(wav: Buffer): Promise<SttResult> {
    const body = new FormData();
    body.append("model_id", this.modelId);
    body.append("language_code", LANGUAGE_CODE);
    body.append("timestamps_granularity", "word");
    body.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = (await res.json().catch(() => null)) as {
      text?: string;
      words?: ScribeWord[];
      detail?: Array<{ msg?: string }>;
      message?: string;
    } | null;
    if (!res.ok || !data) {
      const detail = data?.detail?.[0]?.msg ?? data?.message ?? `ElevenLabs request failed (${res.status})`;
      throw new Error(detail);
    }
    const segments = groupWordsIntoSegments(Array.isArray(data.words) ? data.words : []);
    return {
      text: segments.map((s) => s.text).join(" ") || data.text || "",
      segments,
      model: this.modelId,
    };
  }
}
