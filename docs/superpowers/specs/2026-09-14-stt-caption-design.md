# Smart Caption (STT + Caption) — Design

Date: 2026-09-14. Status: approved approach C (start cloud, migrate self-hosted later).

## Overview
Per-part Persian transcription + caption/subtitle generation inside content-room.
Trigger: «رونویسی» button on each part card (files tab), after the part file is
uploaded/linked. No new server: the main server orchestrates —
Telegram download → ffmpeg to 16kHz wav → cloud STT → store transcript+SRT →
cloud LLM builds platform captions. STT behind a provider interface so a
future self-hosted Persian model replaces the cloud without UI changes.

## Goals
- Accurate Persian transcript per part (editable, searchable).
- SRT subtitle file per part (from segment timestamps).
- AI captions per part: YouTube (title+description) and Instagram (caption+hashtags),
  Persian tone matching the channel, copy-to-clipboard + «use» actions.
- Async with visible status: queued → processing → ready | error (+ retry).

## Non-Goals
- Real-time/live transcription. Diarization v1 (single-speaker assumption).
- Auto-publishing captions (human copies/uses explicitly).
- Self-hosted model now (migration path only).

## Architecture
- No new infrastructure. Main Next.js server only; ffmpeg (present) for audio
  extraction; telegram file download via existing client (self-hosted Bot API).
- Provider abstraction: `SttProvider.transcribe(wav): segments[]` and
  `CaptionProvider.generate(transcript, channel): captions`. Cloud
  implementations first; `FasterWhisperProvider` later on the GPU box.
- API keys in ENV: `STT_API_KEY`, `CAPTION_LLM_KEY` (+ model names). Never in repo.

## Components
- UI (PartUploadCard, files tab): «رونویسی» button, status pill, transcript
  editor (textarea, save), «دانلود SRT», «ساخت کپشن» → two caption cards
  (YouTube / Instagram) with copy buttons.
- API: `POST parts/[id]/transcribe` (enqueue), `GET parts/[id]/transcript`
  (status+text+segments), `PATCH` transcript (manual edit), `POST
  parts/[id]/captions` (generate), `GET parts/[id]/subtitle.srt` (download).
- Job runner: in-process queue (existing patterns) with concurrency 1–2,
  progress in DB row, timeouts per chunk, retry x2 on transient errors.
- DB (new migration): `part_transcripts` (id, part_id UNIQUE FK cascade,
  language default 'fa', full_text, segments JSONB [{start,end,text}],
  srt_text, captions JSONB {youtube, instagram}, stt_provider, stt_model,
  status, error, version, created/updated). Manual edits bump version and
  regenerate SRT from edited text (even split) — timestamps approximate.

## Data Flow
1. Click رونویسی → job row `queued`.
2. Download part file (Telegram fileRef) to /tmp → ffmpeg `-ar 16000 -ac 1` wav.
3. If duration > 10 min: split into 10-min chunks (30s overlap) → transcribe
   each → offset-merge segments.
4. Persist transcript + segments + generated SRT. Cleanup /tmp.
5. Click ساخت کپشن → LLM prompt (FA, channel tone, product title/type,
   transcript truncated to budget) → store {youtube, instagram}.

## SRT
`index\nHH:MM:SS,mmm --> HH:MM:SS,mmm\ntext\n` from segments; re-split lines
> 80 chars at word boundaries.

## Limits / Cost / Errors
- V1 cap: 60 min per part; files above → 422 with message.
- Cost guard: env `STT_MAX_MINUTES_PER_DAY` (default 300); counter in DB.
- Chunkwah errors: mark job error with Persian message + «تلاش دوباره».
- Secrets: never logged; file buffers never persisted outside /tmp.

## Permissions
Reuse content-room model: trigger/edit = `update_assigned_content` or
`manage_content_room`; view = `view_content_room`.

## Testing
- Unit: SRT builder, chunk merge with offsets, prompt builder, provider
  interface fakes.
- Route tests with mocked providers (success/422/409/500 paths).
- Manual e2e: one real short part → transcript+SRT+captions verified by user.

## Migration to Self-Hosted (later)
- Implement `FasterWhisperProvider` (FastAPI on GPU box, Persian-tuned
  whisper-large, e.g. Neyshekar-family) behind the same interface + ENV switch.
- Recommended box when the time comes: 16GB+ VRAM (T4 minimum, L4/A10G
  ideal), 32GB RAM, 100GB disk. No code changes in UI/routes.

## Open Items (before implementation)
1. STT vendor + key procurement (candidate: ElevenLabs Scribe for FA accuracy).
2. Caption LLM vendor + key (FA quality matters more than price here).
3. Confirm 60-min cap and daily minutes budget.
4. Confirm caption tones per channel (one sample each is enough).
