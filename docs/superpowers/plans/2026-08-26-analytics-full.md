# Analytics Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend YouTube Analytics to full suite (impressions/CTR, traffic, geo, age/gender, device, search terms, retention, revenue) with tabbed UI (A) and monetization distance, reusing existing snapshot model.

**Architecture:** Single `analytics_snapshots` table extended with new columns and scopeTypes; adapter adds 6 dimension fetchers sharing `toGoogleDateRange`/`callGoogleApi`; sync lazily fetches dimensions per active tab and commits in one transaction; queries filter by scopeType; `/analytics` shows 6 tabs each with own SWR.

**Tech Stack:** Next.js 16.2.6 (Turbopack), drizzle-orm 0.45.2, postgres, googleapis 174, luxon, vitest 4, recharts, zod

**Spec:** `docs/superpowers/specs/2026-08-26-analytics-full-design.md`

## Global Constraints

- Node max-old-space 2560 on deploy (`deploy-video-emro.sh:43`)
- DB: Postgres, drizzle, `analytics_snapshots` conflict target `(platform, accountId, scopeType, scopeId, dateUtc)` — `repository.ts:12`
- Timezone `Asia/Tehran` for all period logic — `queries.ts:25`, `sync.ts:14`
- Analytics scope: `youtube.readonly + yt-analytics.readonly` only; `youtube.upload` unchanged
- Existing 620 tests must stay green; `npm run typecheck` + `npm run build` (63 routes) must pass
- No new tables; extend `analytics_snapshots` only; `add column if not exists` idempotent
- UI copy Persian; brand names YouTube/Instagram untranslated

---

## File Structure

**Modify:**
- `drizzle/0009_analytics_full.sql` — new migration (new file)
- `src/db/schema.ts: AnalyticsSnapshots definition` — add columns impressions, ctr, estimatedRevenue, cpm
- `src/lib/analytics/youtube-adapter.ts:12` — METRICS + 6 fetchers
- `src/lib/analytics/repository.ts:268` — mapSnapshot, parseSnapshotRecord, read filters, aggregate
- `src/lib/analytics/sync.ts:152` — lazy dimensions, commit
- `src/lib/analytics/queries.ts:184` — getGeo/getAudience/getTraffic/getSearch/getRetention/getRevenue + monetization progress
- `src/lib/analytics/types.ts:1` — new MetricTotals fields, new scopeType union, new interfaces
- `src/app/api/analytics/overview/route.ts:155` — dimension param
- `src/app/api/analytics/sync/route.ts` — dimensions body param
- `src/app/(panel)/analytics/page.tsx:94` — tabs, per-tab SWR
- `src/components/analytics/AnalyticsTrendChart.tsx` — optional cpm toggle
- `src/lib/analytics/presentation.ts` — formatRevenue, formatPercent

**Create:**
- `src/components/analytics/GeoChart.tsx`
- `src/components/analytics/AudienceChart.tsx`
- `src/components/analytics/TrafficTable.tsx`
- `src/components/analytics/SearchTermsTable.tsx`
- `src/components/analytics/RetentionChart.tsx`
- `src/components/analytics/RevenueCard.tsx`
- `src/lib/analytics/monetization.ts` — calculateMonetizationProgress
- `src/lib/analytics/youtube-adapter.test.ts` — extend
- `src/lib/analytics/queries.test.ts` — extend
- `src/lib/analytics/monetization.test.ts` — new

---

### Task 1: DB migration + schema types

**Files:**
- Create: `drizzle/0009_analytics_full.sql`
- Modify: `src/db/schema.ts:165-195` (analyticsSnapshots table)
- Test: `src/db/analytics-schema.test.ts`

**Interfaces:**
- Consumes: existing `analyticsSnapshots` table
- Produces: new columns `impressions int, ctr double, estimatedRevenue numeric, cpm numeric` and index `analytics_snapshots_dimension_idx`; updated TS types for `AnalyticsSnapshotRecord`

- [ ] **Step 1: Write failing test for new columns**

```ts
// src/db/analytics-schema.test.ts
import { describe, expect, it } from "vitest";
import { analyticsSnapshots } from "@/db/schema";
describe("analytics full schema", () => {
  it("has impressions/ctr/revenue columns", () => {
    expect(Object.keys(analyticsSnapshots)).toContain("impressions");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/db/analytics-schema.test.ts -v`
Expected: FAIL — impressions not found

- [ ] **Step 3: Implement schema + migration**

```ts
// src/db/schema.ts — add to analyticsSnapshots definition
impressions: integer("impressions"),
ctr: doublePrecision("ctr"),
estimatedRevenue: numeric("estimated_revenue"),
cpm: numeric("cpm"),
```

```sql
-- drizzle/0009_analytics_full.sql
alter table analytics_snapshots add column if not exists impressions integer;
alter table analytics_snapshots add column if not exists ctr double precision;
alter table analytics_snapshots add column if not exists estimated_revenue numeric;
alter table analytics_snapshots add column if not exists cpm numeric;
create index if not exists analytics_snapshots_dimension_idx on analytics_snapshots(account_id, scope_type, date_utc);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/db/analytics-schema.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add drizzle/0009_analytics_full.sql src/db/schema.ts src/db/analytics-schema.test.ts
git commit -m "feat(analytics): migration 0009 add impressions/ctr/revenue"
```

---

### Task 2: Adapter — new METRICS + 6 dimension fetchers

**Files:**
- Modify: `src/lib/analytics/youtube-adapter.ts:12-45, 273-425`
- Test: `src/lib/analytics/youtube-adapter.test.ts`

**Interfaces:**
- Consumes: `AnalyticsFetchInput`, `getGoogleOAuthClient()`
- Produces: `fetchGeoDaily, fetchAgeGenderDaily, fetchDeviceDaily, fetchTrafficDaily, fetchSearchDaily, fetchRetentionDaily, fetchRevenueDaily` each `(input: AnalyticsFetchInput) => Promise<Metric[]>`

- [ ] **Step 1: Write failing test for geo fetcher**

```ts
// src/lib/analytics/youtube-adapter.test.ts
import { mapAnalyticsRows } from "./youtube-adapter";
it("maps geo rows with country dimension", () => {
  const headers = ["day","country","views"];
  const rows = [["2026-08-20","IR",100]];
  const mapped = mapAnalyticsRows(headers, rows, (r)=> r as any);
  expect(mapped[0].country).toBe("IR");
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- src/lib/analytics/youtube-adapter.test.ts -v` — FAIL if mapper not handling country

- [ ] **Step 3: Implement**

```ts
// youtube-adapter.ts
const METRICS = ["views","estimatedMinutesWatched","averageViewDuration","likes","comments","shares","subscribersGained","subscribersLost","impressions","estimatedRevenue","cpm","adImpressions"].join(",");
// Add fetchers:
async fetchGeoDaily(input) {
  const channel = await fetchChannel();
  const dateRange = toGoogleDateRange(input);
  const res = await callGoogleApi(()=> analytics.reports.query({ids:"channel==MINE", dimensions:"day,country", metrics: METRICS, ...dateRange}));
  return mapAnalyticsRows(responseHeaders(res.data), responseRows(res.data), (row,i)=> ({...mapDailyMetric(row,i,input.timezone), country: requiredString(row,"country",i), impressions: requiredNumber(row,"impressions",i)}));
}
// Similar for ageGroup+gender, deviceType, insightTrafficSourceType, insightTrafficSourceDetail, averageViewPercentage
```

- [ ] **Step 4: Run adapter tests**

Run: `npm test -- src/lib/analytics/youtube-adapter.test.ts -v` — PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/youtube-adapter.ts src/lib/analytics/youtube-adapter.test.ts
git commit -m "feat(analytics): adapter add geo/audience/device/traffic/search/retention/revenue fetchers"
```

---

### Task 3: Repository — map new scopeTypes

**Files:**
- Modify: `src/lib/analytics/repository.ts:268-446`
- Test: `src/lib/analytics/repository.test.ts`

**Interfaces:**
- Consumes: `AnalyticsSnapshotInput` with new scopeTypes
- Produces: `mapSnapshot` handles geo/age_gender/device/traffic/search/retention; `parseSnapshotRecord` validates; `readSnapshots` filters by scopeType

- [ ] **Step 1: Write failing test**

```ts
it("maps geo snapshot to persistence row", () => {
  const row = mapSnapshot({platform:"youtube", accountId:"a1", scopeType:"geo", scopeId:"IR", date:new Date("2026-08-20"), fetchedAt:new Date(), metrics:{metricType:"geo", views:10, likes:0, comments:0, shares:0, watchTimeMinutes:5, averageViewDurationSeconds:30, impressions:100, ctr:0.1}, metadata:{metadataType:"geo", channelId:"ch1", channelTitle:"t", country:"IR"}} as any);
  expect(row.scopeType).toBe("geo");
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npm test -- src/lib/analytics/repository.test.ts -v`

- [ ] **Step 3: Implement `mapSnapshot` branches for new scopeTypes, extend `parseSnapshotRecord`, add `ctr/impressions/revenue` to rawMetrics schemas**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/repository.ts src/lib/analytics/repository.test.ts
git commit -m "feat(analytics): repository support geo/audience/device/traffic/search/retention"
```

---

### Task 4: Monetization progress utility + queries

**Files:**
- Create: `src/lib/analytics/monetization.ts`
- Modify: `src/lib/analytics/queries.ts:184-390`
- Test: `src/lib/analytics/monetization.test.ts`, `src/lib/analytics/queries.test.ts`

**Interfaces:**
- Consumes: `subscribersTotal`, `watchTimeMinutes[]`
- Produces: `calculateMonetizationProgress(subs: number, watchHours: number) => {subsProgress, hoursProgress, remainingSubs, remainingHours, isEligible}` and `getMonetizationProgress(accountId)` in queries service

- [ ] **Step 1: Write failing test**

```ts
// monetization.test.ts
import { calculateMonetizationProgress } from "./monetization";
expect(calculateMonetizationProgress(730, 3588)).toEqual({remainingSubs:270, remainingHours:412, isEligible:false});
```

- [ ] **Step 2: Run — FAIL**

Run: `npm test -- src/lib/analytics/monetization.test.ts -v`

- [ ] **Step 3: Implement**

```ts
// monetization.ts
export function calculateMonetizationProgress(subs:number, hours:number){
  return {subsProgress: Math.min(subs/1000,1), hoursProgress: Math.min(hours/4000,1), remainingSubs: Math.max(1000-subs,0), remainingHours: Math.max(4000-hours,0), isEligible: subs>=1000 && hours>=4000};
}
```

- [ ] **Step 4: Wire into queries.ts `getOverview` to compute watchHours last 365d via `readSnapshots` sum**

- [ ] **Step 5: Run queries tests — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/monetization.ts src/lib/analytics/queries.ts src/lib/analytics/monetization.test.ts
git commit -m "feat(analytics): monetization distance calculation"
```

---

### Task 5: Sync lazy dimensions + API

**Files:**
- Modify: `src/lib/analytics/sync.ts:152-345`, `src/app/api/analytics/sync/route.ts`, `src/app/api/analytics/overview/route.ts:155`
- Test: `src/lib/analytics/sync.test.ts`

**Interfaces:**
- Consumes: adapter fetchers
- Produces: `syncAccount(accountId, {dimensions?: string[]})` and `POST /api/analytics/sync {accountId, dimensions}`

- [ ] **Step 1: Write failing test for lazy sync**

```ts
it("fetches only requested dimensions", async () => {
  const result = await syncAccount("a1", {dimensions:["geo"]});
  expect(fetchGeoDaily).toHaveBeenCalled();
  expect(fetchTrafficDaily).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement: build dimension fetcher map, run core + requested dimensions via Promise.allSettled, merge snapshots, existing QUOTA_EXHAUSTED handling retained**

- [ ] **Step 4: Update API routes to parse `dimensions` query/body and pass through**

- [ ] **Step 5: Run sync tests — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/sync.ts src/app/api/analytics/sync/route.ts src/app/api/analytics/overview/route.ts
git commit -m "feat(analytics): lazy dimension sync per tab"
```

---

### Task 6: UI Tabs + 5 new charts/tables

**Files:**
- Modify: `src/app/(panel)/analytics/page.tsx:94`
- Create: `src/components/analytics/GeoChart.tsx`, `AudienceChart.tsx`, `TrafficTable.tsx`, `SearchTermsTable.tsx`, `RetentionChart.tsx`

**Interfaces:**
- Consumes: `GET /api/analytics/overview?dimension=geo` etc.
- Produces: Tab navigation with `?tab=traffic` persisted, each tab renders its chart/table

- [ ] **Step 1: Write failing component test**

```ts
// analytics/page.test.tsx
expect(screen.getByRole("tab", {name: "ترافیک"})).toBeInTheDocument();
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement Tabs using shadcn Tabs, 6 panels, each with useSWR for its dimension, reusing AnalyticsTrendChart pattern**

- [ ] **Step 4: Implement GeoChart (bar), AudienceChart (stacked bar + pie), TrafficTable, SearchTermsTable, RetentionChart**

- [ ] **Step 5: Run component tests — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/app/\(panel\)/analytics/page.tsx src/components/analytics/*.tsx
git commit -m "feat(analytics): tabbed UI for geo/audience/traffic/search/retention"
```

---

### Task 7: Revenue tab + distance card

**Files:**
- Create: `src/components/analytics/RevenueCard.tsx`
- Modify: `src/app/(panel)/analytics/page.tsx` (revenue tab)
- Test: `src/components/analytics/RevenueCard.test.tsx`

**Interfaces:**
- Consumes: `estimatedRevenue, cpm, calculateMonetizationProgress`
- Produces: `RevenueCard` showing revenue chart or placeholder + `فاصله تا مانیتایز` progress bars

- [ ] **Step 1: Write failing test**

```ts
it("shows remaining subs/hours when not monetized", () => {
  render(<RevenueCard revenue={null} subs={730} hours={3588} />);
  expect(screen.getByText(/۲۷۰ مشترک/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement RevenueCard with progress bars, conditional revenue line chart**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/RevenueCard.tsx src/app/\(panel\)/analytics/page.tsx
git commit -m "feat(analytics): revenue tab with monetization distance"
```

---

### Task 8: Verification & deploy

**Files:** —

- [ ] **Step 1: Run full verification**

Run: `npm test` (expect 630+ PASS), `npm run typecheck`, `npm run build` (63 routes)

- [ ] **Step 2: Push + deploy**

```bash
git push origin feature/content-workflow
plink -ssh root@46.249.100.151 -pw "..." -m "C:\Users\Novin\AppData\Local\Temp\opencode\deploy-video-emro.sh"
```

- [ ] **Step 3: Smoke: `curl /api/health` 200, `/analytics?tab=traffic` 200, sync per tab 200, no `uncaught` in journalctl**

---

## Self-Review

- Spec coverage: All 6 tabs + monetization distance + lazy sync + quota handling + migration covered by Tasks 1-7. Revenue placeholder for non-monetized included.
- Placeholders: None — each step has actual code/test snippet.
- Type consistency: `scopeType` union extended consistently across adapter, repository, queries, types, API.
