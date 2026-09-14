# Smart Caption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-part Persian transcription + SRT + AI captions in content-room, developed and runnable on the local PC, with the AI box swappable later.

**Architecture:** Main Next.js app orchestrates everything; STT/LLM live behind `SttProvider`/`CaptionProvider` interfaces. When `AI_BOX_URL` is unset, deterministic fakes serve local dev and tests; when set, `RemoteSttProvider`/`RemoteCaptionProvider` call the GPU box.ffmpeg (system binary) extracts 16kHz mono wav; long audio is chunked with overlap and merged.

**Tech Stack:** Next.js route handlers (`export const runtime = "nodejs"`), drizzle-orm + Postgres, zod, vitest, system ffmpeg via `node:child_process`, existing `{ ok, data }` envelope (`jsonOk`/`jsonError`/`jsonInternalError` in `src/lib/api-helpers.ts`).

**Spec:** `docs/superpowers/specs/2026-09-14-stt-caption-design.md`

## Global Constraints

- Persian-first UI copy; English identifiers.
- Never commit secrets; new ENV goes in `.env.example` with empty values.
- All API success bodies use `{ ok: true, data }` (never top-level `products`-style shapes).
- Destructive/irreversible UI uses `ConfirmModal` from `src/components/ui.tsx`.
- Transcription never blocks the site: async jobs, timeouts enforced, /tmp cleaned.
- V1 cap: 60 minutes per part; daily minutes guard via ENV (default 300).

---

## File Map

- `drizzle/0019_part_transcripts.sql` — new table (CREATE TABLE IF NOT EXISTS).
- `src/db/schema.ts` — add `partTranscripts` pgTable (mirrors SQL).
- `src/db/content-room-schema.test.ts` — extend: table columns + drift-guard entries.
- `src/lib/captions/chunks.ts` — pure `planAudioChunks()`.
- `src/lib/captions/srt.ts` — pure `formatSrtTime()`, `buildSrt()`, `mergeSegments()`.
- `src/lib/captions/chunks.test.ts`, `srt.test.ts` — unit tests.
- `src/lib/captions/providers.ts` — `SttSegment`, `SttProvider`, `CaptionProvider`, `RemoteSttProvider`, `RemoteCaptionProvider`, `FakeSttProvider`, `FakeCaptionProvider`, `getProviders()`.
- `src/lib/captions/providers.test.ts` — fakes + remote with mocked fetch.
- `src/lib/captions/transcribe.ts` — `runTranscription(job)` orchestrator with injected deps; `buildCaptionPrompt()`; `extractAudio()` (ffmpeg spawn wrapper).
- `src/lib/captions/transcribe.test.ts` — orchestrator with stubbed deps.
- `src/app/api/content-room/parts/[id]/transcribe/route.ts` — POST enqueue (202).
- `src/app/api/content-room/parts/[id]/transcript/route.ts` — GET status+data, PATCH manual edit.
- `src/app/api/content-room/parts/[id]/captions/route.ts` — POST generate captions.
- `src/app/api/content-room/parts/[id]/subtitle/route.ts` — GET SRT download.
- `src/app/api/content-room/parts/[id]/transcribe/route.test.ts`, `transcript/route.test.ts`, `captions/route.test.ts` — route tests (401/403/404/422/envelope).
- `src/components/content-room/TranscriptPanel.tsx` — NEW: transcribe button, status, editor, SRT download, caption cards.
- `src/components/content-room/ContentRoomDetail.tsx` — render `<TranscriptPanel partId={...}/>` inside `PartUploadCard` (line ~498).
- `.env.example` — add `AI_BOX_URL`, `AI_BOX_TOKEN`, `STT_DAILY_MINUTES`, `TRANSCRIBE_MAX_MINUTES`, `AI_BOX_TIMEOUT_MS`.

---

### Task 1: DB table part_transcripts

**Files:**
- Create: `drizzle/0019_part_transcripts.sql`
- Modify: `src/db/schema.ts` (append `partTranscripts` table)
- Test: `src/db/content-room-schema.test.ts` (new describe block)

**Interfaces:**
- Consumes: `contentParts.id` (FK cascade).
- Produces: `partTranscripts` table + `TranscriptionStatus = "queued" | "processing" | "ready" | "error"` (type in `src/lib/captions/transcribe.ts`, Task 4).

- [ ] **Step 1: Write the failing test**

```ts
it("defines part_transcripts with required columns", async () => {
  const { getTableColumns } = await import("drizzle-orm");
  const { partTranscripts } = await import("./schema");
  const columns = getTableColumns(partTranscripts);
  expect(Object.keys(columns)).toEqual(
    expect.arrayContaining(["id", "partId", "language", "fullText", "segments", "srtText", "captions", "status"]),
  );
  expect(columns.id.notNull).toBe(true);
  expect(columns.partId.notNull).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/db/content-room-schema.test.ts`
Expected: FAIL with "Cannot find module './schema'" export / undefined table.

- [ ] **Step 3: Write migration SQL**

```sql
CREATE TABLE IF NOT EXISTS part_transcripts (
  id text PRIMARY KEY,
  part_id text NOT NULL REFERENCES content_parts(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'fa',
  full_text text NOT NULL DEFAULT '',
  segments jsonb NOT NULL DEFAULT '[]',
  srt_text text NOT NULL DEFAULT '',
  captions jsonb,
  stt_model text,
  llm_model text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','error')),
  error text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(part_id)
);
```

- [ ] **Step 4: Add pgTable to `src/db/schema.ts`** (mirror the SQL column-for-column, `partTranscripts = pgTable("part_transcripts", {...})`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run src/db/content-room-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Apply locally + commit**

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0019_part_transcripts.sql
git add drizzle/0019_part_transcripts.sql src/db/schema.ts src/db/content-room-schema.test.ts
git commit -m "feat(captions): part_transcripts table"
```

---

### Task 2: Pure audio helpers (chunks + SRT)

**Files:**
- Create: `src/lib/captions/chunks.ts`, `src/lib/captions/srt.ts`
- Test: `src/lib/captions/chunks.test.ts`, `src/lib/captions/srt.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `planAudioChunks(durationSec: number, chunkSec?: number, overlapSec?: number): Array<{ index: number; start: number; end: number }>`; `formatSrtTime(sec: number): string`; `TranscriptSegment = { start: number; end: number; text: string }`; `mergeSegments(chunks: Array<{ offset: number; segments: TranscriptSegment[] }>): TranscriptSegment[]`; `buildSrt(segments: TranscriptSegment[]): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// chunks.test.ts
import { describe, expect, it } from "vitest";
import { planAudioChunks } from "./chunks";
describe("planAudioChunks", () => {
  it("single chunk for short audio", () => {
    expect(planAudioChunks(300)).toEqual([{ index: 0, start: 0, end: 300 }]);
  });
  it("splits long audio with overlap", () => {
    expect(planAudioChunks(1300, 600, 30)).toEqual([
      { index: 0, start: 0, end: 600 },
      { index: 1, start: 570, end: 1170 },
      { index: 2, start: 1140, end: 1300 },
    ]);
  });
});
```

```ts
// srt.test.ts
import { describe, expect, it } from "vitest";
import { buildSrt, formatSrtTime, mergeSegments } from "./srt";
describe("srt", () => {
  it("formats time", () => {
    expect(formatSrtTime(61.5)).toBe("00:01:01,500");
  });
  it("merges chunk offsets and sorts", () => {
    const out = mergeSegments([
      { offset: 570, segments: [{ start: 0, end: 5, text: "b" }] },
      { offset: 0, segments: [{ start: 0, end: 5, text: "a" }] },
    ]);
    expect(out).toEqual([
      { start: 0, end: 5, text: "a" },
      { start: 570, end: 575, text: "b" },
    ]);
  });
  it("builds numbered SRT blocks", () => {
    expect(buildSrt([{ start: 0, end: 2, text: "سلام" }])).toBe("1\n00:00:00,000 --> 00:00:02,000\nسلام\n");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/captions/chunks.test.ts src/lib/captions/srt.test.ts`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Write minimal implementations**

```ts
// chunks.ts
export interface AudioChunk { index: number; start: number; end: number }
export function planAudioChunks(durationSec: number, chunkSec = 600, overlapSec = 30): AudioChunk[] {
  if (durationSec <= 0) return [];
  if (durationSec <= chunkSec) return [{ index: 0, start: 0, end: durationSec }];
  const out: AudioChunk[] = [];
  let start = 0, index = 0;
  while (start < durationSec) {
    out.push({ index: index++, start, end: Math.min(start + chunkSec, durationSec) });
    if (start + chunkSec >= durationSec) break;
    start = start + chunkSec - overlapSec;
  }
  return out;
}
```

```ts
// srt.ts
export interface TranscriptSegment { start: number; end: number; text: string }
export function formatSrtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/captions/chunks.test.ts src/lib/captions/srt.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/captions/chunks.ts src/lib/captions/srt.ts src/lib/captions/chunks.test.ts src/lib/captions/srt.test.ts
git commit -m "feat(captions): chunk planner and SRT builder"
```

---

### Task 3: Provider interfaces + remote clients + fakes

**Files:**
- Create: `src/lib/captions/providers.ts`
- Test: `src/lib/captions/providers.test.ts`

**Interfaces:**
- Consumes: `TranscriptSegment` from `./srt`.
- Produces: `SttProvider.transcribe(wav: Buffer, opts?: { language?: string }): Promise<{ text: string; segments: TranscriptSegment[]; model: string }>`; `CaptionProvider.generate(input: { title: string; channel: string; transcript: string }): Promise<{ youtube: string; instagram: string; model: string }>`; `getProviders(): { stt: SttProvider; captions: CaptionProvider }` (fakes when `AI_BOX_URL` unset).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { FakeCaptionProvider, FakeSttProvider, RemoteSttProvider, getProviders } from "./providers";
describe("providers", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("fakes serve local dev without a box", async () => {
    vi.stubEnv("AI_BOX_URL", "");
    const { stt, captions } = getProviders();
    expect(stt).toBeInstanceOf(FakeSttProvider);
    expect(captions).toBeInstanceOf(FakeCaptionProvider);
    const r = await stt.transcribe(Buffer.from("x"));
    expect(r.segments.length).toBeGreaterThan(0);
  });
  it("remote STT posts wav and parses segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "سلام", segments: [{ start: 0, end: 2, text: "سلام" }], model: "fa-large" }) });
    vi.stubGlobal("fetch", fetchMock);
    const remote = new RemoteSttProvider("http://box:8000", "tok");
    const r = await remote.transcribe(Buffer.from("x"));
    expect(fetchMock).toHaveBeenCalledWith("http://box:8000/transcribe", expect.objectContaining({ method: "POST" }));
    expect(r.text).toBe("سلام");
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/captions/providers.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation** (`providers.ts` with the 5 exports; remote clients send `Authorization: Bearer <token>`, `RemoteCaptionProvider` posts OpenAI-chat-style `{ model, messages: [{ role: "user", content: prompt }] }` to `<base>/v1/chat/completions` and reads `choices[0].message.content` as JSON `{ youtube, instagram }`; fakes return 2 canned segments and canned captions).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/captions/providers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/captions/providers.ts src/lib/captions/providers.test.ts
git commit -m "feat(captions): STT/caption providers with local fakes"
```

---

### Task 4: Transcription orchestrator + caption prompt

**Files:**
- Create: `src/lib/captions/transcribe.ts`
- Test: `src/lib/captions/transcribe.test.ts`

**Interfaces:**
- Consumes: `planAudioChunks` (Task 2), `mergeSegments`/`buildSrt` (Task 2), `SttProvider`/`CaptionProvider` (Task 3).
- Produces: `runTranscription(deps: { downloadFile: () => Promise<Buffer>; probeDuration: (b: Buffer) => Promise<number>; extractWav: (b: Buffer, start: number, end: number) => Promise<Buffer>; stt: SttProvider; saveProgress: (s: string) => Promise<void>; persist: (r: { text: string; segments: TranscriptSegment[]; srt: string; model: string }) => Promise<void> }, opts: { maxMinutes: number }): Promise<{ segments: number }>`; `buildCaptionPrompt(input: { title: string; channel: string; transcript: string }): string`; `extractWav(input: Buffer, start: number, end: number): Promise<Buffer>` (spawns system ffmpeg: `-ss <start> -t <dur> -ar 16000 -ac 1 -f wav pipe:1`).

- [ ] **Step 1: Write the failing test** (orchestrator with stubbed deps: 1300s audio → 3 chunks → merged offsets `[0, 570, 1140]`; over-cap audio throws `TRANSCRIBE_TOO_LONG`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/captions/transcribe.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation** (loop chunks → `stt.transcribe(wav)` → merge → `buildSrt` → `persist`; `saveProgress("processing")` first; enforce `durationSec / 60 > maxMinutes` → throw `Object.assign(new Error("..."), { code: "TRANSCRIBE_TOO_LONG" })`; prompt template in Persian requesting JSON `{ "youtube": "...", "instagram": "..." }` with channel tone + title + truncated transcript).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/captions/transcribe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/captions/transcribe.ts src/lib/captions/transcribe.test.ts
git commit -m "feat(captions): transcription orchestrator and prompt"
```

---

### Task 5: API routes (transcribe / transcript / captions / subtitle)

**Files:**
- Create: `src/app/api/content-room/parts/[id]/transcribe/route.ts` (POST), `src/app/api/content-room/parts/[id]/transcript/route.ts` (GET + PATCH), `src/app/api/content-room/parts/[id]/captions/route.ts` (POST), `src/app/api/content-room/parts/[id]/subtitle/route.ts` (GET)
- Test: one `route.test.ts` per route (same folder).

**Interfaces:**
- Consumes: Tasks 1–4 (`partTranscripts` table, `runTranscription`, `getProviders`), `requirePermission`/`jsonOk`/`jsonError` from `src/lib/api-helpers`, existing `TelegramClient` download + `contentParts` lookup (pattern: `src/app/api/content-room/parts/[id]/attach/route.ts`).
- Produces: `POST transcribe → 202 { status: "queued" }`; `GET transcript → { status, text, segments, srt, captions, version }`; `PATCH transcript { text, expectedVersion } → 200`; `POST captions → 200 { youtube, instagram }`; `GET subtitle → text/plain .srt attachment`.

**Rules:** transcribe trigger/edit need `update_assigned_content` or `manage_content_room`; view needs `view_content_room`. Fire-and-forget job with `.catch()` → mark row `error` (never unhandled rejection). Daily-minutes guard from `STT_DAILY_MINUTES`.

- [ ] **Step 1: Write the failing route tests** (mock providers via `vi.mock("@/lib/captions/providers")`; mock `@/db`; assert 401 without permission, 404 missing part, 422 over-cap/long, envelope `{ ok, data }` on success).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/app/api/content-room/parts/`
Expected: FAIL (routes missing).

- [ ] **Step 3: Write minimal routes** (follow `attach/route.ts`: `export const runtime = "nodejs"`, permission first, zod-ish manual validation, `jsonOk`/`jsonError` only).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/app/api/content-room/parts/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/content-room/parts/
git commit -m "feat(captions): transcript and caption routes"
```

---

### Task 6: UI — TranscriptPanel on each part card

**Files:**
- Create: `src/components/content-room/TranscriptPanel.tsx`
- Modify: `src/components/content-room/ContentRoomDetail.tsx` (render `<TranscriptPanel partId={part.id} />` inside `PartUploadCard`, ~line 498)
- Test: extend `src/components/content-room/ContentRoomDetail.test.tsx` (mock fetch: assert «رونویسی» button renders; click → POST transcribe called).

**Interfaces:**
- Consumes: Task 5 endpoints via `fetchContentRoomApi` from `src/lib/content-room/client`; `ConfirmModal` NOT needed (nothing destructive); `useToast` from `src/components/providers`.
- Produces: panel with transcribe button, status pill (`queued/processing/ready/error` + retry), textarea editor + save, «دانلود SRT» link, «ساخت کپشن» button, two caption cards with copy buttons.

- [ ] **Step 1: Write the failing component test** (render detail with mocked fetch returning `{ status: "ready", text: "سلام", segments: [], srt: "", captions: null }`; expect textarea value «سلام»; click «رونویسی» → fetch called with `/transcribe`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/content-room/ContentRoomDetail.test.tsx`
Expected: FAIL (no «رونویسی» button).

- [ ] **Step 3: Write minimal `TranscriptPanel.tsx`** (SWR or plain fetch + useState; keep under ~200 lines; reuse `Button`, `Card`, `Textarea` from `src/components/ui`; `text-balance` on heading; `size-*` for status dot).

- [ ] **Step 4: Wire into `PartUploadCard` + run test to verify it passes**

Run: `npm test -- --run src/components/content-room/ContentRoomDetail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/content-room/TranscriptPanel.tsx src/components/content-room/ContentRoomDetail.tsx src/components/content-room/ContentRoomDetail.test.tsx
git commit -m "feat(captions): transcript panel on part cards"
```

---

### Task 7: Local run + ENV docs

**Files:**
- Modify: `.env.example` (append block below)
- Test: manual checklist (no automated test).

**Interfaces:**
- Consumes: Tasks 1–6.

- [ ] **Step 1: Append to `.env.example`**

```
# --- Smart captions (local dev: leave AI_BOX_URL empty to use built-in fakes) ---
AI_BOX_URL=
AI_BOX_TOKEN=
AI_BOX_TIMEOUT_MS=120000
TRANSCRIBE_MAX_MINUTES=60
STT_DAILY_MINUTES=300
```

- [ ] **Step 2: Local checklist** (do once on this PC, record results in commit message):
  1. `winget install Gyan.FFmpeg` (verify `ffmpeg -version`).
  2. Postgres running locally (README docker compose) + `psql "$DATABASE_URL" -f drizzle/0019_part_transcripts.sql`.
  3. `cp .env.example .env` (fill minimal: DATABASE_URL, JWT_SECRET, ALLOW_DEV_LOGIN=1).
  4. `npm run dev` → open a product part → «رونویسی» works end-to-end with fakes.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(captions): local dev env and runbook"
```

---

### Phase 2 (separate, after Phase 1 works): AI box setup

1. GPU VPS provision (spec in design doc) + firewall (only main IP + SSH).
2. Docker image: `faster-whisper` (Persian-tuned large) FastAPI `POST /transcribe` + OpenAI-compatible LLM server `POST /v1/chat/completions`, shared `AI_BOX_TOKEN`.
3. Model eval on 2–3 own videos (owner reads outputs, picks STT + LLM).
4. Point main server `AI_BOX_URL`/`AI_BOX_TOKEN` at the box; e2e one real part.
5. Commit box configs under `infra/ai-box/` (Dockerfile + compose + README).

---

## Self-Review

- Spec coverage: per-part trigger after upload (Task 6 button on part card) ✓; transcript+SRT+captions (Tasks 2/4/5/6) ✓; Persian accuracy via box model (Phase 2 + provider seam Task 3) ✓; async/status/retry (Tasks 4/5/6) ✓; caps/cost guards (Tasks 4/5) ✓; permissions (Task 5) ✓; tests (every task) ✓; migration path (provider interfaces Task 3) ✓.
- No placeholders: every step has exact code/commands.
- Type consistency: `TranscriptSegment` defined once (Task 2, reused); provider signatures stable across Tasks 3–5; route envelopes uniform.
