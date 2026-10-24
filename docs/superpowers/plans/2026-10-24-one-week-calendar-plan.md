# One-Week Calendar Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 15 safe, non-publishable calendar plan entries for 2-8 Aban 1405 while excluding Shock and Tinazh.

**Architecture:** Store fixed planning entries in a dedicated PostgreSQL table seeded by an idempotent migration. Merge them into the existing calendar API and render them as non-draggable `planned` events so neither publish worker can observe or execute them.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, PostgreSQL 16, React, SWR, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-24-one-week-calendar-plan-design.md`

## Global Constraints

- The date range is exactly 1405/08/02 through 1405/08/08 in `Asia/Tehran`.
- Seed exactly 15 events and zero `shock` or `tinazh` events.
- Relative times are morning 09:00, noon 12:00, morning-to-noon 10:30, and Friday 10:00.
- Plan entries must never enter `content` or `workflow_publications` and must never be visible to a publish worker.
- Existing real publication drag/drop behavior must remain unchanged.
- Migration and deployment must be idempotent.

---

### Task 1: Calendar Plan Persistence And Seed

**Files:**
- Create: `drizzle/0050_calendar_plan_entries.sql`
- Modify: `src/db/schema.ts`
- Modify: `src/lib/ids.ts`
- Create: `src/db/calendar-plan-schema.test.ts`

**Interfaces:**
- Produces: `calendarPlanEntries` Drizzle table with `id`, `title`, `channel`, `platform`, `scheduledAt`, `createdBy`, `createdAt`, and `updatedAt` fields.
- Produces: 15 stable `CPE-1405-NNNNNN` rows for the approved week.
- Consumes: `users.id` for nullable creator attribution and existing channel identifiers.

- [ ] **Step 1: Write the failing schema and seed test**

Assert that `calendarPlanEntries` exposes the required columns. Read `drizzle/0050_calendar_plan_entries.sql` and assert 15 `CPE-1405-` inserts, no `shock`/`tinazh`, and `ON CONFLICT DO NOTHING`.

```ts
expect(Object.keys(calendarPlanEntries)).toEqual(expect.arrayContaining([
  "id", "title", "channel", "platform", "scheduledAt", "createdBy", "createdAt", "updatedAt",
]));
expect((sql.match(/CPE-1405-/g) ?? [])).toHaveLength(15);
expect(sql).not.toMatch(/'shock'|'tinazh'/);
expect(sql).toContain("ON CONFLICT (id) DO NOTHING");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/db/calendar-plan-schema.test.ts`

Expected: FAIL because the table and migration do not exist.

- [ ] **Step 3: Implement schema and migration**

Define the table in `src/db/schema.ts`, add `CPE` to `generateEntityId`, and create the SQL table with an index on `(scheduled_at, id)`. Seed the 15 approved rows using explicit Tehran offsets (`+03:30`) and stable IDs.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- src/db/calendar-plan-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0050_calendar_plan_entries.sql src/db/schema.ts src/lib/ids.ts src/db/calendar-plan-schema.test.ts
git commit -m "feat(calendar): add one-week plan entries"
```

### Task 2: Calendar API Plan Merge

**Files:**
- Modify: `src/app/api/calendar/route.ts`
- Modify: `src/app/api/calendar/route.test.ts`

**Interfaces:**
- Consumes: `calendarPlanEntries` and `CHANNELS`.
- Produces: calendar events with `source: "plan"`, `planEntryId`, `contentId: "plan:<id>"`, `status: "planned"`, and the existing date/channel fields.

- [ ] **Step 1: Write failing API tests**

Add a third mocked query for plan rows. Assert that a visible plan row maps to:

```ts
expect(planEvent).toMatchObject({
  source: "plan",
  planEntryId: "CPE-1405-000001",
  contentId: "plan:CPE-1405-000001",
  channel: "zaviye_no",
  accountId: "ACC-1405-398046",
  status: "planned",
  publishAtJalali: "1405/08/02 11:00",
});
```

Add cases proving `channel=zaviye_no` filters out Tamashin and hidden channels are omitted.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/app/api/calendar/route.test.ts`

Expected: FAIL because plan rows are not queried or returned.

- [ ] **Step 3: Implement API merge**

Query `calendarPlanEntries`, reject `isChannelHidden(row.channel)`, apply platform/account/channel filters, derive the account from `getChannelConfig`, and append mapped plan events. Keep the existing legacy and workflow branches unchanged.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/app/api/calendar/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/calendar/route.ts src/app/api/calendar/route.test.ts
git commit -m "feat(calendar): expose safe plan entries"
```

### Task 3: Planned Event Presentation And Interaction Guard

**Files:**
- Create: `src/lib/calendar-events.ts`
- Create: `src/lib/calendar-events.test.tsx`
- Modify: `src/app/(panel)/calendar/page.tsx`
- Modify: `src/components/ui.tsx`

**Interfaces:**
- Produces: `isCalendarPlanEvent(event): boolean` and `canRescheduleCalendarEvent(event): boolean`.
- Consumes: API event `source` and `planEntryId` fields.

- [ ] **Step 1: Write failing interaction tests**

```ts
expect(canRescheduleCalendarEvent({ source: "plan" })).toBe(false);
expect(canRescheduleCalendarEvent({ source: "publication" })).toBe(true);
expect(isCalendarPlanEvent({ source: "plan" })).toBe(true);
```

Add a StatusBadge assertion that `planned` maps to `برنامه انتشار`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/calendar-events.test.tsx`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the interaction guard and presentation**

Use `canRescheduleCalendarEvent` for `draggable`, drag handlers, cursor classes, and drop eligibility. Planned list rows render as a non-link container instead of `/content/plan:*`. Add `planned` to `STATUS_LABELS` with a neutral blue treatment and `برنامه انتشار` copy.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/lib/calendar-events.test.tsx src/app/api/calendar/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar-events.ts src/lib/calendar-events.test.tsx "src/app/(panel)/calendar/page.tsx" src/components/ui.tsx
git commit -m "feat(calendar): render plan entries safely"
```

### Task 4: Full Verification And Production Deployment

**Files:**
- Verify only; no expected source changes.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: deployed migration, revision, 15 production rows, and observable calendar API events.

- [ ] **Step 1: Run local verification**

```bash
npm test -- src/db/calendar-plan-schema.test.ts src/app/api/calendar/route.test.ts src/lib/calendar-events.test.tsx
npm run typecheck
npx eslint src/app/api/calendar/route.ts src/app/api/calendar/route.test.ts "src/app/(panel)/calendar/page.tsx" src/components/ui.tsx src/lib/calendar-events.ts src/lib/calendar-events.test.tsx src/db/calendar-plan-schema.test.ts
npm run build
git diff --check
```

Expected: all commands exit zero; existing Turbopack NFT warnings may remain but no build failure.

- [ ] **Step 2: Push commits**

```bash
git push origin feature/content-workflow
```

- [ ] **Step 3: Back up and apply migration**

On `/opt/emro`, create a timestamped `pg_dump`, fast-forward pull the branch, and run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/0050_calendar_plan_entries.sql`.

- [ ] **Step 4: Build and restart**

Run `/opt/emro/deploy.sh` after the migration or perform its equivalent build and `systemctl restart emro.service` sequence.

- [ ] **Step 5: Verify production state**

Assert:

```sql
select count(*) from calendar_plan_entries; -- 15
select count(*) from calendar_plan_entries where channel in ('shock','tinazh'); -- 0
```

Authenticate as the owner and verify `/api/calendar` returns 15 `source=plan` events, the first is `1405/08/02 11:00`, the last is `1405/08/08 10:00`, health is `200 {"ok":true}`, the service PID is stable, and the current invocation contains no fatal errors.
