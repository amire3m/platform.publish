# Live Conductor (کنداکتور کامل لایو) — Design

Date: 2026-08-30 · Status: approved by user

## Goal
Turn the existing single-shot playlist live streamer into a full broadcast conductor:
live queue editing, daily recurring schedules with auto start/stop, saved channel
profiles with encrypted stream keys, Telegram notifications + session history, and
logo overlay in encode mode.

## Non-goals
Multi-destination restream, intro/outro videos, per-item scheduling, SSE (SWR polling
stays), camera sources. One active session at a time (existing constraint).

## Architecture (approach: evolve the current in-memory engine)
- Execution engine stays in-memory (`PlaylistStreamer`), extended with queue mutations
  and a `persist` dependency that snapshots session state to DB.
- Conductor logic in `src/lib/live/conductor.ts`, invoked from the existing 60s
  `instrumentation.ts` tick (`runLiveConductorTick`).
- Tehran-time window math mirrors the analytics scheduler pattern.
- Notifications via existing `TelegramClient` + `telegram_topics` key `live_alerts`;
  silently degrade when Telegram is unconfigured (pattern: workflow notifications).

## Data model (migration `drizzle/0013_live_conductor.sql`)
- `live_channels` — id LCH, name, rtmp_url, stream_key_encrypted (AES-256-GCM via
  `encryptSecret`), provider ('youtube'|'custom'), is_active, timestamps.
- `live_schedules` — id LSC, name, channel_ref→live_channels, playlist_input,
  quality ('720'|'1080'), loop, overlay_enabled, start_tehran 'HH:MM', end_tehran
  'HH:MM' (nullable = until queue ends/loop), days_of_week jsonb int[] (0=Sat..6=Fri,
  matches `getDay()`-style 0-based? → we use JS convention 0=Sun..6=Sat), enabled,
  last_started_at, last_error, timestamps.
- `live_sessions` — id LSE, schedule_ref (nullable), channel_ref (nullable),
  playlist_input, quality, loop, overlay_enabled, state, started_at, finished_at,
  error, stats jsonb {itemsPlayed, itemsFailed, secondsStreamed}, timestamps.
- `live_session_items` — id LSI, session_ref→live_sessions ON DELETE CASCADE,
  position, video_id, title, duration_sec, status, started_at, finished_at.

## Engine upgrades (`playlist-streamer.ts`, `yt-dlp.ts`)
- `fetchVideoMeta(videoId)` — single-video metadata via yt-dlp `--print id\ttitle\tduration`.
- `buildFfmpegArgs(inputs, target, quality, overlay?)` — overlay only applied when
  quality==='720': `-i logo -filter_complex overlay=position:opacity` chain appended
  to the scale filter.
- Queue mutations: `addItem(input, position?)` (resolves metadata; pending only for
  move/remove), `removeItem(videoId)`, `moveItem(videoId, -1|+1)`, `replayItem(videoId)`
  (resets a done/failed/skipped item to pending and jumps to it next).
- `persist` dep snapshots on: session start, item transition, loop, session end.
  Interrupted sessions (server restart) marked `state='interrupted'` on next snapshot
  detection — conductor tick does the DB-side reconciliation.

## Conductor (`conductor.ts`)
Per tick (60s):
1. If no active session: find enabled schedules whose Tehran-time window contains
   now and whose day-of-week matches → auto-start first due (resolve channel, decrypt
   key, build target, start streamer, set `last_started_at`, clear `last_error`).
   Window containment handles midnight-spanning (start > end).
2. If active session was started by a schedule with an `end_tehran` and now ≥ end →
   `stop("schedule_end")`.
3. Telegram notify: `live_started` (auto or manual), `live_stopped` (with duration +
   played/failed summary), `live_error`, `live_schedule_started`.

## APIs (all under existing live permission: manage_content_room OR publish_now OR new `manage_live`)
- `POST /api/live/playlist` — accept `channelRef` (resolve rtmp+key) or legacy raw
  `rtmpUrl`+`streamKey`; plus quality/loop/overlay/scheduleRef.
- `POST /api/live/control` — actions: skip, stop, add (url/videoId), remove, move
  (direction), replay (videoId).
- `/api/live/channels` GET/POST/PATCH/DELETE — key write-only, masked in responses.
- `/api/live/schedules` GET/POST/PATCH/DELETE — validate HH:MM + days 0-6.
- `/api/live/sessions` GET (list, desc, limit) / `[id]` GET (with items).
- `/api/live/settings` GET/PATCH — overlay config {logoPath, position, opacity} stored
  in `appSettings.capabilityConfig.live`.

## UI (`/live`, five tabs, existing ui.tsx + SWR)
«پخش زنده» (status + queue table with add/remove/move/replay + overlay toggle) ·
«برنامه‌ها» (CRUD, JalaliDateTimePicker for start/end) · «کانال‌ها» (CRUD, masked key)
· «تاریخچه» (sessions list + detail) · polling 4s live tab, 30s others.

## Testing (vitest, co-located *.test.ts)
- yt-dlp: overlay args, fetchVideoMeta parse.
- streamer: queue mutations (add/remove/move/replay guards), persist called on
  transitions, overlay passthrough of opts.
- conductor: due-start, day mismatch, already-running, auto-stop at end, midnight
  window, disabled schedule, notification calls (fake client).
- channels API: encrypt called, masked output, 403 without permission (route handlers
  tested directly with injected db? follow existing route-test patterns if any; else
  extract pure helpers and test those).

## Security
Stream keys AES-256-GCM at rest, never returned by any API (write-only + masked
`maskSecret` display), never logged. RTMP targets masked in all public shapes.
