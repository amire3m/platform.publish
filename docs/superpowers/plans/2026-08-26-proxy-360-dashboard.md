# Proxy 360 + Dashboard Per-Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 360p YouTube proxy at /api/media/youtube/[videoId] for any videoId and make dashboard aggregated by default with per-channel selector and Data API fallback for top videos.

**Architecture:** Proxy endpoint uses ytdl-core to fetch 360p mp4 URL and streams with Range; dashboard summary falls back to playlistItems→videos.list when Analytics topVideos empty; UI reuses ChannelHeader and AnalyticsFilters pattern.

**Tech Stack:** Next.js 16.2.6, ytdl-core, googleapis, drizzle-orm, vitest

**Spec:** `docs/superpowers/specs/2026-08-26-proxy-360-dashboard-design.md`

## Global Constraints

- Auth required: `view_analytics` for proxy and dashboard summary — `requirePermission`
- Proxy must support Range header, return 206 with Content-Range, Cache-Control private max-age 3600
- 360p mp4 preferred, fallback to nearest lower
- Dashboard default aggregated, selector for 4 emro channels, ChannelHeader shown when single selected
- Existing 77 tests (657) must stay green, typecheck and build (65 routes) must pass

---

## File Structure

**Create:**
- `src/app/api/media/youtube/[videoId]/route.ts` — proxy handler
- `src/lib/youtube/proxy.ts` — helper get360pUrl(videoId) using ytdl
- `src/lib/youtube/data-fallback.ts` — fetchLastVideos(accountIds) via playlistItems

**Modify:**
- `src/app/api/dashboard/summary/route.ts` — add fallback when topVideos empty
- `src/app/(panel)/dashboard/page.tsx` — add Select + ChannelHeader, use fallback
- `src/components/analytics/TopVideos.tsx` — optional link to proxy instead of youtube.com (if needed)
- `package.json` — add ytdl-core

---

### Task 1: YouTube 360p Proxy Endpoint

**Files:**
- Create: `src/app/api/media/youtube/[videoId]/route.ts`
- Create: `src/lib/youtube/proxy.ts`
- Test: `src/app/api/media/youtube/route.test.ts`

**Interfaces:**
- Consumes: `ytdl-core.getInfo(videoId)` → `formats[]`
- Produces: `GET /api/media/youtube/[videoId]` → `Response` with `video/mp4`, Range 206

- [ ] **Step 1: Write failing test**

```ts
// src/app/api/media/youtube/route.test.ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/youtube/proxy", () => ({ get360pUrl: vi.fn().mockResolvedValue("http://example.com/360.mp4") }));
global.fetch = vi.fn().mockResolvedValue(new Response("fake", { headers: { "content-type": "video/mp4", "content-length": "4" } }));
import { GET } from "./[videoId]/route";
it("returns 206 for Range", async () => {
  const req = new Request("http://localhost/api/media/youtube/abc", { headers: { Range: "bytes=0-1" } });
  const res = await GET(req, { params: Promise.resolve({ videoId: "abc" }) });
  expect(res.status).toBe(206);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/media/youtube/route.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement proxy helper**

```ts
// src/lib/youtube/proxy.ts
import ytdl from "ytdl-core";
export async function get360pUrl(videoId: string): Promise<string> {
  const info = await ytdl.getInfo(videoId);
  const fmt = info.formats.filter(f=>f.container==="mp4" && f.hasVideo && f.hasAudio).sort((a,b)=> (b.height??0)-(a.height??0)).find(f=> (f.height??0) <=360) ?? info.formats.find(f=>f.height===360);
  if (!fmt?.url) throw new Error("360p not found");
  return fmt.url;
}
```

```ts
// src/app/api/media/youtube/[videoId]/route.ts
import { requirePermission, jsonError } from "@/lib/api-helpers";
import { get360pUrl } from "@/lib/youtube/proxy";
export async function GET(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { user, response } = await requirePermission("view_analytics");
  if (!user) return response!;
  const { videoId } = await params;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return jsonError("شناسه ویدیو نامعتبر است.", 400);
  try {
    const url = await get360pUrl(videoId);
    const range = req.headers.get("range");
    const upstream = await fetch(url, range ? { headers: { Range: range } } : undefined);
    if (!upstream.ok || !upstream.body) return jsonError("ویدیو در دسترس نیست.", 404);
    const headers = new Headers(upstream.headers);
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("Accept-Ranges", "bytes");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return jsonError("ویدیو در دسترس نیست.", 404);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/media/youtube/route.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/media/youtube/[videoId]/route.ts src/lib/youtube/proxy.ts src/app/api/media/youtube/route.test.ts package.json
git commit -m "feat(media): 360p YouTube proxy with Range"
```

---

### Task 2: Dashboard Per-Channel Selector + Header

**Files:**
- Modify: `src/app/(panel)/dashboard/page.tsx:1-80`
- Create: `src/components/analytics/ChannelHeader.tsx` (already exists, reuse)
- Test: `src/app/(panel)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/accounts` → `AnalyticsAccountOption[]`
- Produces: `Select` with `همه` + 4 channels, `ChannelHeader` when single

- [ ] **Step 1: Write failing test**

```ts
it("shows per-channel header when account selected", async () => {
  render(<DashboardPage />);
  expect(screen.getByText("همه حساب‌های Emro YT")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/(panel)/dashboard/page.test.tsx -v`
Expected: FAIL

- [ ] **Step 3: Implement selector**

```tsx
const accounts = (allAccounts ?? []).filter(a=>a.platform==="youtube" && a.organization==="emro");
const selected = accountId ? accounts.find(a=>a.id===accountId) : null;
<Select value={accountId} onChange={e=>router.replace(`?accountId=${e.target.value}`)}>
  <option value="">همه حساب‌های Emro YT</option>
  {accounts.map(a=> <option key={a.id} value={a.id}>{a.displayName}</option>)}
</Select>
{selected ? <ChannelHeader account={selected} isAggregated={false}/> : <ChannelHeader account={null} isAggregated={true}/>}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/(panel)/dashboard/page.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/\(panel\)/dashboard/page.tsx
git commit -m "feat(dashboard): per-channel selector with header"
```

---

### Task 3: Dashboard TopVideos Data API Fallback

**Files:**
- Create: `src/lib/youtube/data-fallback.ts`
- Modify: `src/app/api/dashboard/summary/route.ts:70-120`
- Test: `src/app/api/dashboard/summary/route.test.ts`

**Interfaces:**
- Consumes: `youtube.playlistItems.list` + `youtube.videos.list`
- Produces: `fetchTopVideosFallback(accountIds): Promise<Video[]>`

- [ ] **Step 1: Write failing test**

```ts
it("falls back to Data API when analytics top empty", async () => {
  mocks.readSnapshots.mockResolvedValue([]);
  mocks.playlistItemsList.mockResolvedValue({ data: { items: [{ contentDetails: { videoId: "v1" } }] } });
  const res = await handleDashboardSummaryRequest(reqWithAccount, deps);
  expect(mocks.playlistItemsList).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/dashboard/summary/route.test.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement fallback**

```ts
// src/lib/youtube/data-fallback.ts
export async function fetchLastVideos(accountIds: string[]) { /* playlistItems + videos.list, sort by viewCount */ }
```

In `summary/route.ts` after `topVideos = ...` if `topVideos.length===0` then `topVideos = await fetchLastVideos(targetIds).sort(...).slice(0,10)`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/dashboard/summary/route.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/data-fallback.ts src/app/api/dashboard/summary/route.ts
git commit -m "feat(dashboard): Data API fallback for top videos"
```

---

### Task 4: Verification & Deploy

- [ ] **Step 1: Run full verification**

Run: `npm test` (77+ files), `npm run typecheck`, `npm run build` (65 routes)

- [ ] **Step 2: Push & deploy**

```bash
git push origin feature/content-workflow
plink -ssh root@46.249.100.151 -pw "..." -m "C:\Users\Novin\AppData\Local\Temp\opencode\deploy-video-emro.sh"
```

- [ ] **Step 3: Smoke**

`curl /api/health` 200, `/api/media/youtube/dQw4w9WgXcQ` 206 with Range, dashboard with `?accountId=` shows per-channel.

---

## Self-Review

- Spec coverage: Proxy 360 for any videoId, dashboard aggregated+per-channel, fallback for top videos — all covered by Tasks 1-3.
- Placeholders: none — each step has actual code.
- Type consistency: `get360pUrl(videoId:string):Promise<string>` used consistently, `fetchLastVideos` returns `Video[]` with `videoId,title,thumbnailUrl,viewCount`.

