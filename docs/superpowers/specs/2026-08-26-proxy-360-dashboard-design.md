# Proxy 360 + Dashboard Per-Channel — Design Spec

**Date:** 2026-08-26
**Status:** Approved (4/4)
**Branch:** feature/content-workflow
**Scope:** Add 360p YouTube proxy for any videoId via /api/media/youtube/[videoId] (Range, auth) + make dashboard aggregated by default with per-channel selector and Data API fallback for TopVideos.

## 1. Context & Goals
Analytics topVideos empty because `day,video` Analytics query is `unsupported_query` for these channels (verified via live probe: 400 query not supported). Dashboard summary also reads same `analytics_snapshots` and shows empty. User also needs playback when YouTube is filtered on device: must proxy 360p through server.

Goals: proxy works for any videoId, 360p, Range, auth; dashboard shows aggregated by default but can switch to single channel with its visual identity; topVideos fallback to Data API when Analytics empty.

Non-goals: download, higher qualities, caching to disk, Invidious dependency.

## 2. Architecture
- **Proxy:** `src/app/api/media/youtube/[videoId]/route.ts` — GET, `requirePermission("view_analytics")`, use `ytdl-core` (or `youtubei.js` if ytdl blocked) to get `info.formats`, pick `height===360 && ext==="mp4"` else nearest lower, `fetch(format.url, {headers: {Range}})` and pipe to `NextResponse` with `Content-Type: video/mp4`, `Accept-Ranges: bytes`, `Content-Range` passthrough, `Cache-Control: private, max-age=3600`. No persistent storage.
- **Dashboard fallback:** `src/app/api/dashboard/summary/route.ts` — after `getTopVideos` from DB, if empty and `accountId` in allowed, call `fetchLastVideosViaDataApi(accountIds)` (playlistItems→videos.list) and sort by viewCount for top, publishedAt for latest. Same helper used by `src/app/api/analytics/videos/route.ts`.

## 3. Data Flow
Client `video` tag `src="/api/media/youtube/dQw4w9WgXcQ"` with `Range` → server `ytdl.getInfo(videoId)` → 360p URL → `fetch` → stream → client. For dashboard: `GET /api/dashboard/summary?accountId=ACC-...` → `analyticsRepository.readSnapshots` → if top empty → `youtube.playlistItems.list(uploads)` → `youtube.videos.list` → map to `{videoId,title,thumbnailUrl,viewCount,publishedAt}` → return as `topVideosFallback`.

## 4. UI
- **Dashboard:** Add `Select` (reuse `AnalyticsFilters` pattern) at top of `src/app/(panel)/dashboard/page.tsx` — options: `همه حساب‌های Emro YT` + 4 channels with `displayName`. Default aggregated. On change, `router.replace(?accountId=)`. Show `ChannelHeader` (already created) when single selected. `TopVideos` reused; when `data.topVideos` empty, show `LatestVideosFallback` section with 6 cards linking to proxy `/media/youtube/[id]` instead of youtube.com.
- **Analytics:** Change `TopVideos` links from `https://www.youtube.com/watch?v=` to `/media/youtube/[videoId]` for internal proxy playback (keep `target="_blank"` optional).

## 5. Error Handling
- 404 if video not found/private/age-restricted (ytdl throws) → `jsonError("ویدیو در دسترس نیست.",404)`
- 502 if no 360p format → `jsonError("کیفیت ۳۶۰ موجود نیست.",502)`
- 401 if not authed, 403 if account not in allowed, 429 if rate limited (60/min per IP via `lib/rate-limit`)
- Range: support `bytes=0-`, `bytes=1000-2000`, return 206 with `Content-Range`, else 200.

## 6. Testing
- `src/app/api/media/youtube/route.test.ts`: mock ytdl.getInfo → 360 url, mock fetch → stream, test Range 206, 404, 502.
- `src/app/api/dashboard/summary/route.test.ts`: extend to test fallback when analytics empty → playlistItems called.
- Existing 77 tests (657) stay green, `typecheck`, `build` (65 routes).

## 7. Rollout
- Add `ytdl-core` dependency (or `youtubei.js` as fallback).
- `deploy-video-emro.sh` handles 0008/0009 idempotently, restart, health check.
- No migration.

## 8. Future
- HLS/DASH, higher qualities, disk cache, Invidious fallback if ytdl blocked.
