# Smart Caption (STT + Caption) — Design

Date: 2026-09-14. Status: pay-as-you-go cloud APIs (owner decision 2026-09-15:
API is ~10-50x cheaper than a GPU box at 10-50 audio-hours/month).
Supersedes the self-hosted draft below in the STT/LLM sections; everything
else (trigger, SRT, UI, limits, permissions, tests) stands unchanged.

## Overview
Per-part Persian transcription + caption/subtitle generation inside content-room.
Trigger: «رونویسی» button on each part card (files tab), after the part file is
uploaded/linked. A rented GPU VPS ("AI box") serves a Persian-tuned Whisper
model and a Persian-capable open LLM; the main server orchestrates —
Telegram download → ffmpeg to 16kHz wav → AI box STT → store transcript+SRT →
AI box LLM builds platform captions. No per-use fees anywhere.

> UPDATE 2026-09-15: replaced by cloud APIs (see Status). The provider
> interfaces (`SttProvider`, `CaptionProvider`) stay; `ElevenLabsSttProvider`
> (Scribe v2, `fas`, word timestamps grouped to sentences) and the generic
> OpenAI-compatible `RemoteCaptionProvider` are the live implementations.
> Set `ELEVENLABS_API_KEY` + `CAPTION_LLM_BASE/KEY/MODEL`. Self-hosted box
> remains a future option behind the same interfaces.

## Goals
- Accurate Persian transcript per part (editable, searchable).
- SRT subtitle file per part (from segment timestamps).
- AI captions per part: YouTube (title+description) and Instagram (caption+hashtags),
  Persian tone matching the channel, copy-to-clipboard + «use» actions.
- Async with visible status: queued → processing → ready | error (+ retry).

## Non-Goals
- Real-time/live transcription. Diarization v1 (single-speaker assumption).
- Auto-publishing captions (human copies/uses explicitly).

## Architecture
- Main server (unchanged size): orchestration + queue + storage + UI only.
  Heavy compute never touches it.
- AI box (new rented VPS with NVIDIA GPU): two local HTTP services behind one
  shared-secret token, IP-allowlisted to the main server only:
  - STT: faster-whisper, Persian-tuned whisper-large (Neyshekar-family /
    whisper-persian-v4 class; final pick after eval on our own videos),
    `POST /transcribe` → segments [{start,end,text}] + full text.
  - LLM: OpenAI-compatible server (llama.cpp / vLLM / Ollama) with a
    Persian-capable open model, `POST /v1/chat/completions` for captions.
  - Served sequentially (one job at a time) to fit VRAM; queue lives on main.
- Secrets in ENV: `AI_BOX_URL`, `AI_BOX_TOKEN`. Never in repo.

## AI Box Spec (to procure)
- Minimum: NVIDIA T4 (16GB VRAM), 4+ vCPU, 16GB RAM, 100GB disk.
- Recommended: L4 (24GB) or A10G, 8 vCPU, 32GB RAM, 200GB disk (headroom for
  larger Persian models + concurrent future jobs).
- OS Ubuntu 22.04+, CUDA 12, Docker optional but recommended.
- Network: inbound only from main server IP (46.249.100.151) + SSH key.

## Components (main server)
- UI (PartUploadCard, files tab): «رونویسی» button, status pill, transcript
  editor (textarea, save), «دانلود SRT», «ساخت کپشن» → two caption cards
  (YouTube / Instagram) with copy buttons.
- API: `POST parts/[id]/transcribe` (enqueue), `GET parts/[id]/transcript`
  (status+text+segments), `PATCH` transcript (manual edit), `POST
  parts/[id]/captions` (generate), `GET parts/[id]/subtitle.srt` (download).
- Providers: `SttProvider` (RemoteWhisper impl) + `CaptionProvider`
  (RemoteLlm impl) — same interfaces a future local/cloud swap would use.
- Job runner: in-process queue, concurrency 1 (box serves sequentially),
  per-chunk timeouts, retry x2 on transient/network errors.
- DB (new migration): `part_transcripts` (id, part_id UNIQUE FK cascade,
  language default 'fa', full_text, segments JSONB [{start,end,text}],
  srt_text, captions JSONB {youtube, instagram}, stt_model, llm_model,
  status, error, version, created/updated). Manual edits bump version and
  regenerate SRT from edited text (even split) — timestamps approximate.

## Data Flow
1. Click رونویسی → job row `queued`.
2. Download part file (Telegram fileRef) to /tmp → ffmpeg `-ar 16000 -ac 1` wav.
3. If duration > 10 min: split into 10-min chunks (30s overlap) → transcribe
   each on the box → offset-merge segments.
4. Persist transcript + segments + generated SRT. Cleanup /tmp.
5. Click ساخت کپشن → box LLM prompt (FA, channel tone, product title/type,
   transcript truncated to budget) → store {youtube, instagram}.

## SRT
`index\nHH:MM:SS,mmm --> HH:MM:SS,mmm\ntext\n` from segments; re-split lines
> 80 chars at word boundaries.

## Limits / Cost / Errors
- V1 cap: 60 min per part; files above → 422 with message.
- Fair use: one box job at a time; per-user daily minutes guard (env, default
  300) to keep the queue sane.
- Box unreachable → job error with Persian message + «تلاش دوباره»; main site
  never blocks on the box (async everywhere, timeouts enforced).
- Secrets: never logged; audio buffers only in /tmp with cleanup.

## Permissions
Reuse content-room model: trigger/edit = `update_assigned_content` or
`manage_content_room`; view = `view_content_room`.

## Testing
- Unit: SRT builder, chunk merge with offsets, prompt builder, provider
  fakes (no box needed).
- Route tests with mocked providers (success/422/409/500 paths).
- Box contract test: script hitting staging endpoints with a sample video.
- Manual e2e: one real short part → transcript+SRT+captions verified by owner.

## Scaling Later (no redesign)
- Bigger/faster box or second box + concurrency bump (queue already central).
- Swap models by changing box image + `stt_model`/`llm_model` ENV labels.

## Open Items (before implementation)
1. Procure the GPU VPS (spec above) + give SSH + its IP for allowlisting.
2. Model eval on 2–3 of our own videos (STT candidates + LLM candidates) —
   owner picks by reading outputs.
3. Shared secret exchange for box auth (main → box).
4. Confirm 60-min cap and daily minutes budget.
5. Caption tones per channel (one sample each is enough).
