export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export function formatSrtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)},${String(r).padStart(3, "0")}`;
}

export function mergeSegments(chunks: Array<{ offset: number; segments: TranscriptSegment[] }>): TranscriptSegment[] {
  return chunks
    .flatMap((c) => c.segments.map((s) => ({ start: s.start + c.offset, end: s.end + c.offset, text: s.text })))
    .sort((a, b) => a.start - b.start);
}

export function buildSrt(segments: TranscriptSegment[]): string {
  return segments.map((s, i) => `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text}\n`).join("\n");
}
