# Analytics Full — Design Spec

**Date:** 2026-08-26
**Status:** Approved (4/4 sections)
**Branch:** feature/content-workflow
**Scope:** Extend YouTube Analytics from 8 base metrics to full suite: impressions/CTR, traffic sources, geo, age/gender, device, search terms, retention, revenue + monetization distance. UI tabbed (A).

## 1. Context & Goals

Current system syncs daily `views, likes, comments, shares, watchTimeMinutes, averageViewDuration, subscribersGained/Lost/Total` via `YouTube Analytics API` (`src/lib/analytics/youtube-adapter.ts:12`) and shows overview + trend + TopVideos (`src/app/(panel)/analytics/page.tsx:94`). User wants "همه موارد" + tabbed UI + monetization readiness.

Goals:
- No breaking change to existing overview/TopVideos/CSV export.
- History preserved for period comparison and charts.
- Quota-aware: heavy dimensions fetched lazily per active tab.
- Revenue tab ready before monetization, shows distance to YPP thresholds.

Non-goals: Instagram analytics (still YouTube-only), bulk Reporting API.

## 2. Architecture & Data Flow

```
[YouTube OAuth] -> youtube-adapter (googleapis) -> sync service -> repository -> analytics_snapshots -> queries -> /api/analytics/* -> /analytics (tabs)
```

- **Adapter** (`src/lib/analytics/youtube-adapter.ts`): Keeps `METRICS` base, adds `impressions`, `ctr` (derived as views/impressions), `estimatedRevenue`, `cpm`, `adImpressions` when available. New fetchers share `toGoogleDateRange` and `callGoogleApi`+`classifyGoogleAnalyticsError` existing error mapping. Each fetcher paginates with `startIndex/maxResults=200`.
- **Sync** (`src/lib/analytics/sync.ts`): `syncAccount` always fetches account+content core. Dimension fetches are lazy: `POST /api/analytics/sync { accountId, dimensions: ["geo"|"audience"|...] }`. Core + requested dimensions committed in single `repository.commitSync`. On `QUOTA_EXHAUSTED` remaining accounts skipped, `nextAttemptAt = next Tehran midnight`.
- **Repository** (`src/lib/analytics/repository.ts`): Single table `analytics_snapshots` extended. No new tables.
- **Queries** (`src/lib/analytics/queries.ts`): New methods `getGeo, getAudience, getTraffic, getSearch, getRetention, getRevenue` filtering by `scopeType`. Existing `getOverview/getContent/getExportRows` unchanged.
- **API**: `GET /api/analytics/overview?range=90&accountId=&dimension=geo` etc. `POST /api/analytics/sync` accepts optional `dimensions` array.

## 3. Data Model

**Migration `drizzle/0009_analytics_full.sql`:**
```sql
alter table analytics_snapshots add column if not exists impressions integer;
alter table analytics_snapshots add column if not exists ctr double precision;
alter table analytics_snapshots add column if not exists estimated_revenue numeric;
alter table analytics_snapshots add column if not exists cpm numeric;
-- scopeType remains text, now allows: account, content, geo, age_gender, device, traffic, search, retention
create index if not exists analytics_snapshots_dimension_idx on analytics_snapshots(account_id, scope_type, date_utc);
```

**Snapshot mapping** (`repository.ts:268 mapSnapshot`):
- `geo`: `scopeType=geo, scopeId=countryCode (e.g. IR), rawMetrics={country, views, watchTime...}`
- `age_gender`: `scopeType=age_gender, scopeId=ageGroup:gender (e.g. 25-34:male)`
- `device`: `scopeType=device, scopeId=deviceType`
- `traffic`: `scopeType=traffic, scopeId=insightTrafficSourceType`
- `search`: `scopeType=search, scopeId=keyword (insightTrafficSourceDetail where type=YT_SEARCH)`
- `retention`: `scopeType=retention, scopeId=videoId, rawMetrics includes averageViewPercentage`
- All rows get `id=ANS-...`, `dateJalali`, `dateUtc=startOfTehranDayUtc`.

Deduplication via `snapshotConflictKey` already handles `(platform, accountId, scopeType, scopeId, dateUtc)`.

## 4. Monetization Distance (No new API)

Computed in `queries.ts` from existing data:
- `subs = latest subscribersTotal` (account snapshots last day)
- `watchHours = sum(watchTimeMinutes where dateUtc >= now-365d) / 60`
- `calculateMonetizationProgress(subs, hours)`:
  ```
  subsProgress = min(subs/1000, 1)
  hoursProgress = min(hours/4000, 1)
  remainingSubs = max(1000 - subs, 0)
  remainingHours = max(4000 - hours, 0)
  isEligible = subs>=1000 && hours>=4000
  ```
- Shorts path (10M views) left as secondary metric if `views` Shorts dimension later added; v1 shows only subs+hours.

Displayed in Revenue tab as progress bars + "۲۷۰ مشترک و ۴۱۲ ساعت تا واجد شرایط".

## 5. UI — Tabbed (A)

**Route** `src/app/(panel)/analytics/page.tsx` refactor:
- Top `Tabs` component (6 tabs): `نمای کلی | ترافیک | مخاطب | جستجو | ماندگاری | درآمد`
- Query param `tab` persisted in URL (`?range=30&tab=traffic`). Each tab `useSWR` fetches its dimension endpoint.
- `AnalyticsFilters` remains above tabs (range, accountId, sync button). Sync button now sends `dimensions` of active tab.

**New components** `src/components/analytics/`:
- `GeoChart.tsx` — bar by country (top 10)
- `AudienceChart.tsx` — stacked bars ageGroup x gender + pie deviceType
- `TrafficTable.tsx` — table + donut for insightTrafficSourceType
- `SearchTermsTable.tsx` — sortable table keyword -> views/watchTime
- `RetentionChart.tsx` — per-video avgViewPercentage + optional elapsedVideoTimeRatio line
- `RevenueCard.tsx` — shows estimatedRevenue/cpm or placeholder + MonetizationProgress

Empty states per tab: "هنوز دیتایی برای این بخش sync نشده — تب را باز نگه دارید و همگام‌سازی بزنید".

## 6. Error Handling & Quota

Reuses `classifyGoogleAnalyticsError` (`api_not_enabled, quota_exhausted, reconnect_required, retryable`).
- If one dimension fails with `api_not_enabled`, only that tab shows error banner, others render.
- `quota_exhausted` → repository `markSyncFailure` with `nextAttemptAt` tomorrow; UI `SyncStatus` shows "سهمیه تمام شد".
- `retryable` retried with `RETRY_DELAYS_MS=[500,1500]` existing.
- Lease logic unchanged (`acquireLease` 30min).

## 7. Testing

- `src/lib/analytics/youtube-adapter.test.ts`: fixtures for each fetcher headers/rows, test `mapAccountAnalyticsRows` extended, test `classifyGoogleAnalyticsError` for new metrics.
- `src/lib/analytics/sync.test.ts`: lazy dimension sync, quota skip, retention fetch.
- `src/lib/analytics/queries.test.ts`: `getGeo` filters scopeType=geo, `getRevenueProgress` calculation.
- `src/lib/analytics/repository.test.ts`: `mapSnapshot` for new scopeTypes, migration columns.
- `src/app/(panel)/analytics/page.test.tsx`: tab switching, SWR keys.
- `src/app/api/analytics/overview/route.test.ts`: dimension param.

All tests `vitest run`, `typecheck`, `build` must pass. Existing 620 tests remain green.

## 8. Rollout

- Migration `0009` idempotent (`add column if not exists`).
- Deploy via `C:\Users\Novin\AppData\Local\Temp\opencode\deploy-video-emro.sh`: `pg_dump` backup, `git merge --ff-only`, `npm ci && npm run build`, run migration, `systemctl restart emro`, smoke `curl /api/health`.
- Feature flag none — tabs appear immediately, old overview unchanged. Historical snapshots untouched.

## 9. Future (Out of scope v1)

- YouTube Reporting API bulk CSV for >90d backfill.
- Instagram Insights.
- Real-time retention heatmap per second.
