export interface AudioChunk {
  index: number;
  start: number;
  end: number;
}

export function planAudioChunks(durationSec: number, chunkSec = 600, overlapSec = 30): AudioChunk[] {
  if (durationSec <= 0) return [];
  if (durationSec <= chunkSec) return [{ index: 0, start: 0, end: durationSec }];
  const out: AudioChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < durationSec) {
    out.push({ index: index++, start, end: Math.min(start + chunkSec, durationSec) });
    if (start + chunkSec >= durationSec) break;
    start = start + chunkSec - overlapSec;
  }
  return out;
}
