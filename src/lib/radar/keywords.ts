// Simple bilingual keyword extraction + TF-IDF cosine similarity.
// No external ML — pure JS, fast on a 2GB box. Persian + English.

const FA_STOP = new Set(["و","در","به","از","که","این","آن","با","برای","تا","را","یا","هم","بر","هر","نیز","اما","اگر","چون","چه","همه","خواهد","شد","شده","است","بود","هست","می","های","هایی","ترین","تر","را"]);
const EN_STOP = new Set(["the","a","an","and","or","in","on","at","to","for","of","with","is","are","was","were","be","been","this","that","it","as","by","from"]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !FA_STOP.has(w) && !EN_STOP.has(w));
}

export function extractKeywords(text: string, maxFa = 3, maxEn = 2): { fa: string[]; en: string[] } {
  const tokens = tokenize(text);
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const isFa = (w: string) => /[\u0600-\u06FF]/.test(w);
  const fa = [...freq.entries()].filter(([w]) => isFa(w)).sort((a, b) => b[1] - a[1]).slice(0, maxFa).map(([w]) => w);
  const en = [...freq.entries()].filter(([w]) => !isFa(w) && /^[a-z]+$/.test(w)).sort((a, b) => b[1] - a[1]).slice(0, maxEn).map(([w]) => w);
  return { fa, en };
}

function vec(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

export function cosineSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const va = vec(ta);
  const vb = vec(tb);
  let dot = 0;
  for (const [k, v] of va) dot += v * (vb.get(k) ?? 0);
  const norm = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
  const denom = norm(va) * norm(vb);
  return denom ? dot / denom : 0;
}
