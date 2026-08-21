# YouTube Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real daily YouTube channel and video analytics with 7/30/90-day dashboards, manual and scheduled sync, scoped access, and filtered CSV export.

**Architecture:** Extend the existing generic snapshot model with account/content scopes, then place Google API access behind a focused adapter and a database-backed sync service. API routes and the UI read only normalized database snapshots; manual sync and daily Cron call the same idempotent service.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.9, PostgreSQL, Drizzle ORM, Google APIs Node client, SWR, Recharts, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-youtube-analytics-design.md`

## Global Constraints

- Keep all OAuth credentials server-side and encrypted; never log or return tokens or app secrets.
- Store daily report timestamps in UTC and render dates through `src/lib/date/jalali.ts` using `Asia/Tehran`.
- Support only `range=7|30|90`; reject all other ranges with HTTP 422.
- Backfill at most 90 days on the first successful sync.
- Use the same service for manual and daily synchronization.
- A failed account must not stop synchronization of other accounts.
- Every analytics query must enforce `view_analytics` and `allowedAccountIds`; export additionally requires `export_data`.
- Preserve existing Persian RTL visual patterns and provide responsive mobile states.
- Do not fabricate data for mock or disconnected accounts.
- This directory is not a Git repository. Do not run commit commands; use the verification checkpoint at the end of every task.

## File Map

- `vitest.config.ts`: Vitest aliases and Node test environment.
- `src/lib/analytics/types.ts`: stable domain contracts shared by adapter, sync, queries, and routes.
- `src/lib/analytics/ranges.ts`: date ranges, daily normalization, totals, comparison, and engagement calculations.
- `src/lib/analytics/youtube-adapter.ts`: Google API calls, pagination, batching, and response mapping.
- `src/lib/analytics/repository.ts`: snapshot upsert, account selection, lease, freshness, and scoped query persistence.
- `src/lib/analytics/sync.ts`: account and multi-account orchestration, retry classification, and structured results.
- `src/lib/analytics/queries.ts`: overview, content detail, and CSV row read models.
- `src/lib/analytics/csv.ts`: RFC-compatible CSV escaping and UTF-8 BOM output.
- `src/lib/analytics/scheduler.ts`: durable once-daily scheduling guard.
- `src/app/api/analytics/*`: validation, authorization, and HTTP translation only.
- `src/components/analytics/*`: focused cards, trend chart, video list, status, and filters.
- `src/app/(panel)/analytics/page.tsx`: analytics page orchestration.
- `src/app/(panel)/analytics/content/[id]/page.tsx`: video analytics detail.
- `src/app/(panel)/dashboard/page.tsx`: compact real analytics summary.

---

### Task 1: Test Foundation And Analytics Domain Math

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/analytics/types.ts`
- Create: `src/lib/analytics/ranges.ts`
- Test: `src/lib/analytics/ranges.test.ts`

**Interfaces:**
- Produces: `AnalyticsRange = 7 | 30 | 90`
- Produces: `DailyMetric`, `MetricTotals`, `PeriodComparison`
- Produces: `AnalyticsFetchInput`, `AccountDailyMetric`, `ContentDailyMetric`, `AnalyticsSnapshotInput`
- Produces: `AnalyticsOverview`, `ContentAnalytics`, `AnalyticsExportFilter`, `AnalyticsExportRow`
- Produces: `parseAnalyticsRange(value): AnalyticsRange | null`
- Produces: `buildAnalyticsPeriod(range, now, timezone): { currentStart; currentEnd; previousStart; previousEnd }`
- Produces: `aggregateDailyMetrics(rows): MetricTotals`
- Produces: `calculateEngagementRate(metrics): number`

- [ ] **Step 1: Install and configure the test runner**

Run:

```powershell
npm install --save-dev vitest
```

Add scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
```

- [ ] **Step 2: Write failing range and aggregation tests**

Create `src/lib/analytics/ranges.test.ts` with these cases:

```ts
import { describe, expect, it } from "vitest";
import {
  aggregateDailyMetrics,
  buildAnalyticsPeriod,
  calculateEngagementRate,
  parseAnalyticsRange,
} from "./ranges";

describe("analytics ranges", () => {
  it("accepts only 7, 30, and 90 days", () => {
    expect(parseAnalyticsRange("7")).toBe(7);
    expect(parseAnalyticsRange("30")).toBe(30);
    expect(parseAnalyticsRange("90")).toBe(90);
    expect(parseAnalyticsRange("14")).toBeNull();
  });

  it("builds adjacent current and previous periods in Asia/Tehran", () => {
    const period = buildAnalyticsPeriod(7, new Date("2026-08-21T12:00:00Z"), "Asia/Tehran");
    expect(period.currentEnd.toISOString()).toBe("2026-08-20T20:30:00.000Z");
    expect(period.currentStart.toISOString()).toBe("2026-08-13T20:30:00.000Z");
    expect(period.previousEnd.toISOString()).toBe("2026-08-13T20:30:00.000Z");
    expect(period.previousStart.toISOString()).toBe("2026-08-06T20:30:00.000Z");
  });

  it("aggregates additive metrics and computes weighted engagement", () => {
    const totals = aggregateDailyMetrics([
      { views: 100, likes: 5, comments: 2, shares: 1, watchTime: 60, subscribersGained: 4, subscribersLost: 1 },
      { views: 0, likes: 0, comments: 0, shares: 0, watchTime: 0, subscribersGained: 0, subscribersLost: 1 },
    ]);
    expect(totals.views).toBe(100);
    expect(totals.subscriberGrowth).toBe(2);
    expect(totals.engagementRate).toBe(8);
    expect(calculateEngagementRate({ views: 0, likes: 2, comments: 1, shares: 1 })).toBe(0);
  });
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm test -- src/lib/analytics/ranges.test.ts`

Expected: FAIL because `./ranges` and its exports do not exist.

- [ ] **Step 4: Implement minimal domain contracts and math**

Use Luxon `DateTime` with `startOf("day")` and make the current period end at the start of today in the requested timezone. Use half-open intervals `[start, end)` so adjacent periods never overlap. Round engagement rate only at API presentation time; keep calculations as numbers.

- [ ] **Step 5: Verify GREEN and project types**

Run:

```powershell
npm test -- src/lib/analytics/ranges.test.ts
npm run typecheck
```

Expected: all focused tests PASS and TypeScript exits 0.

---

### Task 2: Snapshot Schema, Lease, And Migration

**Files:**
- Modify: `src/db/schema.ts:82-100`
- Modify: `src/db/schema.ts:167-186`
- Create: `drizzle/0001_youtube_analytics.sql`
- Test: `src/db/analytics-schema.test.ts`

**Interfaces:**
- Produces columns: `analyticsSnapshots.scopeType`, `scopeId`, `contentTitle`, `thumbnailUrl`, `publishedAt`, `subscribersGained`, `subscribersLost`
- Produces account lease columns: `socialAccounts.analyticsSyncLockedAt`, `analyticsSyncLockId`
- Produces scheduler column: `appSettings.lastAnalyticsRunAt`
- Produces unique key: `(platform, accountId, scopeType, scopeId, dateUtc)`

- [ ] **Step 1: Write a failing schema contract test**

Use `getTableColumns` and `getTableConfig` from Drizzle to assert that the new columns exist and exactly one unique index covers the five idempotency columns. The test must also assert that the three nullable metadata fields remain nullable and `scopeType`/`scopeId` are non-null.

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npm test -- src/db/analytics-schema.test.ts`

Expected: FAIL because `scopeType` and lease columns are absent.

- [ ] **Step 3: Extend Drizzle schema**

Add typed columns with defaults suitable for existing rows:

```ts
scopeType: text("scope_type").notNull().default("account"),
scopeId: text("scope_id").notNull().default(""),
contentTitle: text("content_title"),
thumbnailUrl: text("thumbnail_url"),
publishedAt: timestamp("published_at", { withTimezone: true }),
subscribersGained: bigint("subscribers_gained", { mode: "number" }).default(0),
subscribersLost: bigint("subscribers_lost", { mode: "number" }).default(0),
```

Name the unique index `analytics_snapshot_daily_scope_unique`. Add lease columns to `socialAccounts` and `lastAnalyticsRunAt` to `appSettings`.

- [ ] **Step 4: Create a safe SQL migration**

The migration must:

1. Add nullable/defaulted columns.
2. Backfill `scope_id = account_id` for existing rows.
3. Set `scope_id` non-null.
4. Deduplicate existing account snapshots by retaining the newest `created_at` row per unique key.
5. Create `analytics_snapshot_daily_scope_unique`.

Use `IF NOT EXISTS` only where PostgreSQL supports it. Wrap destructive deduplication and index creation in one transaction.

- [ ] **Step 5: Verify schema and migration syntax**

Run:

```powershell
npm test -- src/db/analytics-schema.test.ts
npm run typecheck
npx drizzle-kit check --config drizzle.config.json
```

Expected: tests PASS, typecheck exits 0, and Drizzle reports no schema/config error.

---

### Task 3: YouTube API Adapter And Response Mapping

**Files:**
- Create: `src/lib/analytics/youtube-adapter.ts`
- Test: `src/lib/analytics/youtube-adapter.test.ts`
- Reuse: `src/lib/providers/youtube.ts`

**Interfaces:**
- Consumes: encrypted credential payload after decryption by the caller
- Produces:

```ts
export interface YouTubeAnalyticsAdapter {
  fetchAccountDaily(input: AnalyticsFetchInput): Promise<AccountDailyMetric[]>;
  fetchContentDaily(input: AnalyticsFetchInput): Promise<ContentDailyMetric[]>;
}

export function createYouTubeAnalyticsAdapter(tokens: Credentials): YouTubeAnalyticsAdapter;
export function mapAnalyticsRows<T>(headers: string[], rows: unknown[][], mapper: RowMapper<T>): T[];
```

- [ ] **Step 1: Write failing mapper tests using documented Google row shapes**

Cover reordered column headers, null `rows`, numeric strings, zero views, and content rows containing `day` plus `video`. Assert that unknown columns are ignored and missing required columns throw `AnalyticsResponseError` without including token values.

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `npm test -- src/lib/analytics/youtube-adapter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the pure row mapper**

Map by `columnHeaders[].name`, never by a hard-coded array position. Return normalized `Date`, number, and string fields matching `types.ts`.

- [ ] **Step 4: Implement real Google requests**

Create an OAuth client through `getGoogleOAuthClient()`, set stored credentials, then use:

```ts
google.youtubeAnalytics({ version: "v2", auth });
google.youtube({ version: "v3", auth });
```

Account query metrics:

```text
views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained,subscribersLost
```

Use `dimensions=day` for account data and `dimensions=day,video` for content data. Page content results until a page returns fewer rows than `maxResults`. Fetch video title, thumbnail, and published timestamp with `videos.list` in chunks of 50 IDs.

Fetch the current channel subscriber count with `channels.list` and attach it only to the latest completed account day. Do not copy today's subscriber count onto every historical backfill row; older totals become available naturally as daily snapshots accumulate.

- [ ] **Step 5: Classify adapter errors**

Export `classifyGoogleAnalyticsError(error)` returning one of:

```ts
"retryable" | "reconnect_required" | "api_not_enabled" | "quota_exhausted" | "permanent"
```

Treat `429` and `5xx` as retryable, invalid credentials/insufficient scopes as reconnect-required, API-disabled `403` separately, and quota errors as quota-exhausted.

- [ ] **Step 6: Verify adapter tests and types**

Run:

```powershell
npm test -- src/lib/analytics/youtube-adapter.test.ts
npm run typecheck
```

Expected: mapper and error classification tests PASS with no network calls.

---

### Task 4: Repository, Idempotent Upsert, And Account Lease

**Files:**
- Create: `src/lib/analytics/repository.ts`
- Test: `src/lib/analytics/repository.test.ts`

**Interfaces:**
- Consumes: `DailyMetric[]` from the adapter
- Produces:

```ts
export interface AnalyticsRepository {
  acquireLease(accountId: string, lockId: string, now: Date): Promise<boolean>;
  releaseLease(accountId: string, lockId: string): Promise<void>;
  upsertSnapshots(rows: AnalyticsSnapshotInput[]): Promise<number>;
  getLastSuccessfulDay(accountId: string): Promise<Date | null>;
  listSyncableAccounts(accountIds?: string[]): Promise<SyncableAccount[]>;
}

export function createAnalyticsRepository(database?: typeof db): AnalyticsRepository;
export async function acquireAnalyticsLease(accountId: string, lockId: string, now: Date): Promise<boolean>;
export async function releaseAnalyticsLease(accountId: string, lockId: string): Promise<void>;
export async function upsertAnalyticsSnapshots(rows: AnalyticsSnapshotInput[]): Promise<number>;
export async function getLastSuccessfulAnalyticsDay(accountId: string): Promise<Date | null>;
export async function listSyncableYouTubeAccounts(accountIds?: string[]): Promise<SyncableAccount[]>;
```

- [ ] **Step 1: Write failing repository behavior tests**

Inject a minimal database port into repository internals so tests can use a stateful fake. Cover:

- the same daily scope written twice produces one row and updates metrics;
- a lease younger than 30 minutes blocks a second worker;
- a stale lease can be replaced;
- a lock owner cannot release another owner's lease;
- only active, connected YouTube accounts with credentials are returned.

- [ ] **Step 2: Run repository tests and verify RED**

Run: `npm test -- src/lib/analytics/repository.test.ts`

Expected: FAIL because repository functions do not exist.

- [ ] **Step 3: Implement conditional lease acquisition**

Use one atomic `UPDATE ... WHERE` condition accepting a null lease or `lockedAt < now - 30 minutes`, then inspect returned rows. Never implement the lease as read-then-write.

- [ ] **Step 4: Implement chunked snapshot upsert**

Insert at most 500 rows per statement and use `onConflictDoUpdate` on `analytics_snapshot_daily_scope_unique`. Update metrics and metadata but retain the stable row ID. Generate a new ID with existing `generateEntityId("ANS")` only for rows that do not yet exist.

- [ ] **Step 5: Verify repository behavior**

Run:

```powershell
npm test -- src/lib/analytics/repository.test.ts
npm run typecheck
```

Expected: all repository behavior tests PASS.

---

### Task 5: Synchronization Orchestrator

**Files:**
- Create: `src/lib/analytics/sync.ts`
- Test: `src/lib/analytics/sync.test.ts`
- Modify: `src/app/api/accounts/[id]/[action]/route.ts:22-57`

**Interfaces:**
- Consumes: `YouTubeAnalyticsAdapter`, repository functions, account credentials
- Produces:

```ts
export interface AnalyticsSyncDependencies {
  repository: AnalyticsRepository;
  createAdapter(tokens: Credentials): YouTubeAnalyticsAdapter;
  decrypt(payload: string): string;
  sleep(ms: number): Promise<void>;
}

export interface AccountSyncResult {
  accountId: string;
  status: "synced" | "skipped" | "failed";
  code?: "MOCK_ACCOUNT" | "SYNC_IN_PROGRESS" | "RECONNECT_REQUIRED" | "API_NOT_ENABLED" | "QUOTA_EXHAUSTED" | "SYNC_FAILED";
  snapshotCount: number;
  range?: { start: string; end: string };
  message?: string;
}

export function createAnalyticsSyncService(deps: AnalyticsSyncDependencies): {
  syncAccount(accountId: string, options?: { now?: Date }): Promise<AccountSyncResult>;
  syncAccounts(accountIds: string[], options?: { now?: Date }): Promise<AccountSyncResult[]>;
};
export async function syncYouTubeAccount(accountId: string, options?: { now?: Date }): Promise<AccountSyncResult>;
export async function syncYouTubeAccounts(accountIds: string[], options?: { now?: Date }): Promise<AccountSyncResult[]>;
```

- [ ] **Step 1: Write failing orchestration tests**

Cover first sync backfilling exactly 90 completed days, incremental sync starting after the last successful day, an already-current account returning skipped, retryable failure succeeding on the third attempt, reconnect error not retrying, lease release in `finally`, and one failed account not stopping the next account.

- [ ] **Step 2: Run sync tests and verify RED**

Run: `npm test -- src/lib/analytics/sync.test.ts`

Expected: FAIL because orchestration functions do not exist.

- [ ] **Step 3: Implement date selection and retry**

Use completed calendar days only. Retry adapter calls at most three total attempts with delays of 500ms and 1500ms; inject `sleep` in tests to avoid real waiting. Never retry reconnect-required, API-disabled, or permanent failures.

- [ ] **Step 4: Implement account synchronization**

Acquire lease, decrypt credentials, fetch account and content metrics, upsert all rows, then update `lastSyncAt` and clear `lastError`. On failure, store a secret-safe Persian message/code in `lastError`; do not advance `lastSyncAt`. Always release the lease in `finally`.

- [ ] **Step 5: Replace the timestamp-only per-account sync endpoint**

Check `canAccessAccount(user, id)` before calling `syncYouTubeAccount`. Return HTTP 409 for `SYNC_IN_PROGRESS`, 422 for mock/disconnected accounts, 401/403 only for auth/permission failures, and 502 for external API failures.

After completion, append an `account_analytics_synced` audit event containing only account ID, status, snapshot count, and date range. Never include credentials or raw Google responses.

- [ ] **Step 6: Verify sync behavior**

Run:

```powershell
npm test -- src/lib/analytics/sync.test.ts
npm run typecheck
```

Expected: orchestration tests PASS and the endpoint performs real synchronization rather than updating only a timestamp.

---

### Task 6: Scoped Query Models And Analytics APIs

**Files:**
- Create: `src/lib/analytics/queries.ts`
- Create: `src/lib/analytics/csv.ts`
- Test: `src/lib/analytics/queries.test.ts`
- Test: `src/lib/analytics/csv.test.ts`
- Modify: `src/app/api/analytics/overview/route.ts`
- Modify: `src/app/api/analytics/[scope]/[id]/route.ts`
- Modify: `src/app/api/analytics/export/route.ts`
- Modify: `src/app/api/analytics/sync/route.ts`

**Interfaces:**
- Consumes: normalized snapshots and `allowedAccountIds`
- Produces:

```ts
export interface AnalyticsQueryRepository {
  readSnapshots(filter: SnapshotQueryFilter): Promise<AnalyticsSnapshotRecord[]>;
}

export function createAnalyticsQueryService(repository: AnalyticsQueryRepository): {
  getOverview(input: AnalyticsOverviewInput): Promise<AnalyticsOverview>;
  getContent(input: ContentAnalyticsInput): Promise<ContentAnalytics | null>;
  getExportRows(input: AnalyticsExportFilter): Promise<AnalyticsExportRow[]>;
};
export async function getAnalyticsOverview(input: { range: AnalyticsRange; accountId?: string; allowedAccountIds: string[] | null }): Promise<AnalyticsOverview>;
export async function getContentAnalytics(input: { externalVideoId: string; range: AnalyticsRange; allowedAccountIds: string[] | null }): Promise<ContentAnalytics | null>;
export async function getAnalyticsExportRows(input: AnalyticsExportFilter): Promise<AnalyticsExportRow[]>;
export function encodeAnalyticsCsv(rows: AnalyticsExportRow[]): string;
```

- [ ] **Step 1: Write failing query-model tests**

Use fixed daily rows to assert totals, period-over-period percentages, latest subscriber count rather than summed subscriber counts, missing-day zero fill for charts, top-video ordering, channel-average comparison, and rejection of a requested account outside `allowedAccountIds`.

- [ ] **Step 2: Write failing CSV tests**

Assert UTF-8 BOM, Persian header order, comma/quote/newline escaping, and that channel/range/scope filters are passed unchanged to the repository query.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- src/lib/analytics/queries.test.ts src/lib/analytics/csv.test.ts`

Expected: FAIL because query and CSV modules do not exist.

- [ ] **Step 4: Implement query models**

Filter account scope before aggregation. Use current and previous half-open periods from `ranges.ts`. Return `null` percentage change when the previous value is zero, rather than displaying infinity.

- [ ] **Step 5: Implement HTTP route validation and authorization**

For all routes, derive scope from `user.role` and `user.allowedAccountIds`; owner or an empty restriction list maps to unrestricted access according to existing `canAccessAccount` semantics. Validate `range`, `accountId`, and `scope` before querying.

`POST /api/analytics/sync` rules:

- a provided `accountId` must be accessible;
- no `accountId` means all accessible connected YouTube accounts;
- syncing every account in the installation requires `manage_accounts`;
- return `{ results, succeeded, failed, skipped }`.

- [ ] **Step 6: Implement safe filtered CSV**

Use `encodeAnalyticsCsv` and return `\uFEFF` followed by escaped rows. Filename format: `youtube-analytics-<range>d-YYYY-MM-DD.csv`.

- [ ] **Step 7: Verify API models and types**

Run:

```powershell
npm test -- src/lib/analytics/queries.test.ts src/lib/analytics/csv.test.ts
npm run typecheck
```

Expected: tests PASS and all route return types compile.

---

### Task 7: Durable Daily Scheduler

**Files:**
- Create: `src/lib/analytics/scheduler.ts`
- Test: `src/lib/analytics/scheduler.test.ts`
- Modify: `src/app/api/cron/tick/route.ts`

**Interfaces:**
- Consumes: `syncYouTubeAccounts`, `appSettings.lastAnalyticsRunAt`
- Produces:

```ts
export async function runScheduledAnalyticsSync(now?: Date): Promise<{
  ran: boolean;
  results: AccountSyncResult[];
}>;
```

- [ ] **Step 1: Write failing scheduler tests**

Assert that the first call runs, a second call on the same Tehran calendar day skips, the next day runs, and a partial account failure still records completion of the daily scheduler attempt while preserving per-account errors.

- [ ] **Step 2: Run scheduler test and verify RED**

Run: `npm test -- src/lib/analytics/scheduler.test.ts`

Expected: FAIL because scheduler does not exist.

- [ ] **Step 3: Implement a durable once-daily claim**

Atomically update `app_settings.last_analytics_run_at` only when null or before the start of the current Tehran day. Only the request that receives the updated row runs synchronization.

- [ ] **Step 4: Integrate with the protected Cron endpoint**

Run publish tick and scheduled analytics sequentially and return both results:

```ts
jsonOk({ publish: publishResult, analytics: analyticsResult });
```

Keep existing `x-cron-secret` protection unchanged.

- [ ] **Step 5: Verify scheduler and Cron types**

Run:

```powershell
npm test -- src/lib/analytics/scheduler.test.ts
npm run typecheck
```

Expected: scheduler tests PASS and Cron route compiles.

---

### Task 8: Analytics Dashboard And Video Detail UI

**Files:**
- Create: `src/components/analytics/AnalyticsFilters.tsx`
- Create: `src/components/analytics/AnalyticsStatCards.tsx`
- Create: `src/components/analytics/AnalyticsTrendChart.tsx`
- Create: `src/components/analytics/TopVideos.tsx`
- Create: `src/components/analytics/SyncStatus.tsx`
- Create: `src/lib/analytics/presentation.ts`
- Test: `src/lib/analytics/presentation.test.ts`
- Modify: `src/app/(panel)/analytics/page.tsx`
- Create: `src/app/(panel)/analytics/content/[id]/page.tsx`

**Interfaces:**
- Consumes: `AnalyticsOverview` and `ContentAnalytics` from Task 6
- Produces: responsive Persian analytics dashboard and detail route

- [ ] **Step 1: Write failing presentation tests**

Test formatting for Persian compact numbers, minutes-to-hours watch time, null comparison rendered as `بدون داده مقایسه‌ای`, positive/negative trend labels, and freshness states `fresh|stale|error|never`.

- [ ] **Step 2: Run presentation tests and verify RED**

Run: `npm test -- src/lib/analytics/presentation.test.ts`

Expected: FAIL because presentation helpers do not exist.

- [ ] **Step 3: Implement presentation helpers**

Keep calculation out of React components. Helpers receive numbers/dates and return Persian labels only.

- [ ] **Step 4: Build page data flow**

Store `accountId` and `range` in URL search params. Fetch `/api/analytics/overview?range=<range>&accountId=<id>`. Manual sync must disable the button, show per-account results, then call SWR `mutate` only after the request completes.

- [ ] **Step 5: Build responsive components**

Desktop: stat grid, full-width trend chart, and sortable video table. Mobile: horizontally scrollable stat cards, full-width chart, and video cards instead of a clipped table. Include loading skeleton, no-account, no-data, stale-data, partial-failure, and reconnect-required states.

- [ ] **Step 6: Build content detail page**

Fetch `/api/analytics/content/<externalVideoId>?range=<range>`, show metadata, totals, trend, previous-period change, and channel-average comparison. Return to analytics preserving range/account query params.

- [ ] **Step 7: Fix filtered CSV navigation**

Use a normal download link generated from active filters; do not nest a `Button` inside an internal `<a>` pattern that triggers Next lint. Include `range`, `accountId`, and `scope` in the URL.

- [ ] **Step 8: Verify presentation and build**

Run:

```powershell
npm test -- src/lib/analytics/presentation.test.ts
npm run typecheck
npm run build
```

Expected: tests PASS, typecheck exits 0, and Next build completes.

Manual checks at 390px and 1440px widths:

- filters remain usable;
- no horizontal page overflow;
- sync states are readable;
- video detail navigation preserves filters.

---

### Task 9: Main Dashboard Summary And End-To-End Verification

**Files:**
- Modify: `src/app/(panel)/dashboard/page.tsx`
- Modify: `.env.example`
- Test: `src/lib/analytics/integration.test.ts`

**Interfaces:**
- Consumes: default 90-day `AnalyticsOverview`
- Produces: accurate dashboard summary and complete integration evidence

- [ ] **Step 1: Write a failing integration test**

Wire fake adapter plus stateful repository and assert this scenario:

1. two connected accounts are requested;
2. one returns account/content rows and one returns reconnect-required;
3. successful rows are queryable in 7/30/90-day overview;
4. failed account retains old snapshots and reports stale/error;
5. a restricted user sees only the permitted successful account;
6. CSV row totals equal the filtered overview source rows.

- [ ] **Step 2: Run integration test and verify RED**

Run: `npm test -- src/lib/analytics/integration.test.ts`

Expected: FAIL until all cross-module ports are wired consistently.

- [ ] **Step 3: Update the main dashboard**

Request `/api/analytics/overview?range=90`, replace misleading aggregation with real values, display current subscribers, 90-day views, watch time, and engagement rate, and retain existing workflow cards for scheduled/review/failed content.

- [ ] **Step 4: Document runtime prerequisites**

In `.env.example`, document that the Google Cloud project must enable both YouTube Data API v3 and YouTube Analytics API, and that existing channels may need OAuth reconnection for `yt-analytics.readonly`. Do not add secrets or real IDs.

- [ ] **Step 5: Make the integration test pass**

Instantiate `createAnalyticsSyncService` with the fake adapter, stateful `AnalyticsRepository`, identity decryptor, and zero-delay sleep. Instantiate `createAnalyticsQueryService` over the same stateful repository, then use `encodeAnalyticsCsv` on its filtered export rows. Production wrappers must instantiate the same factories with the Drizzle repository, real decryptor, Google adapter, and real sleep. Do not add unrelated refactors.

- [ ] **Step 6: Run the complete verification suite**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Expected:

- all Vitest tests PASS;
- typecheck exits 0;
- analytics files add no lint failures;
- build completes successfully.

The repository initially has four known lint errors in the analytics link, settings effect, login effect, and providers effect. Task 8 must remove the analytics link error; if the other three unrelated errors remain, report them explicitly rather than claiming lint is clean.

- [ ] **Step 7: Apply migration and validate one real channel in staging**

Before migration, create a PostgreSQL backup. Apply `drizzle/0001_youtube_analytics.sql`, then manually sync one test channel. Compare these values with the same date range in YouTube Studio: views, watch time, subscriber growth, and top three videos. Accept normal YouTube reporting delay, but investigate structural mismatches before enabling daily Cron.

- [ ] **Step 8: Enable daily Cron only after validation**

Invoke the existing protected `/api/cron/tick` on the deployment schedule. Verify the response contains both `publish` and `analytics`, and verify a second invocation on the same Tehran day returns `analytics.ran=false`.
