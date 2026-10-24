# One-Week Calendar Plan Implementation Plan

**Goal:** Add exactly 15 display-only calendar entries for 1405/08/02 through 1405/08/08 without creating publishable or persistent records.

**Architecture:** Define the approved week in a static TypeScript module and merge it into `GET /api/calendar`. Mark entries with `source: "plan"` so the existing calendar can render them while disabling content links and rescheduling only for those entries.

**Spec:** `docs/superpowers/specs/2026-10-24-one-week-calendar-plan-design.md`

## Constraints

- Do not add or modify a database table, schema, migration, or seed.
- Do not create content rows or workflow publications.
- Do not add notifications, jobs, worker queries, or publication behavior.
- Use only `zaviye_no`, `zed_revayat`, and `tamashin`.
- Use `youtube` and derive account IDs from the existing channel configuration.
- Return `status: "planned"`, `source: "plan"`, and stable display IDs.
- Preserve existing real-event links and drag/reschedule behavior.
- Do not push or deploy.

## Task 1: Define Failing Calendar Contracts

**Files:**

- Modify `src/app/api/calendar/route.test.ts`.
- Create `src/app/(panel)/calendar/page.test.tsx`.
- Create `src/lib/calendar-conflicts.test.ts`.

1. Add an API test with literal expectations for all 15 stable IDs, titles, channels, Jalali timestamps, and UTC timestamps.
2. Assert source/status metadata, configured account mapping, and platform/channel filtering.
3. Render a plan event and a real event in the calendar. Assert the plan event is not draggable or linked and that the real event remains draggable and linked.
4. Assert `planned` renders as `برنامه انتشار`.
5. Assert stable display IDs identify events that have no content ID.
6. Run the focused tests and confirm they fail because the static plan and UI guards do not exist.

## Task 2: Add The Static API Overlay

**Files:**

- Create `src/lib/calendar-plan.ts`.
- Modify `src/app/api/calendar/route.ts`.

1. Define the exact 15 approved entries in a readonly typed array.
2. Store explicit Tehran/Jalali and UTC timestamps in each entry.
3. In `GET /api/calendar`, derive each YouTube account ID from channel configuration.
4. Apply platform, account, status, channel, and account-access filters.
5. Append mapped `source: "plan"` events after the existing real-event queries.
6. Do not touch database schemas, migrations, repositories, notifications, or workers.

## Task 3: Guard Plan Presentation And Interaction

**Files:**

- Modify `src/app/(panel)/calendar/page.tsx`.
- Modify `src/components/ui.tsx`.
- Modify `src/lib/calendar-conflicts.ts`.

1. Extend the client event shape with optional `displayId` and `source`, and allow plan events to have a null content ID.
2. Use stable display IDs for plan event keys and conflict identity.
3. Render month plan entries with `draggable=false`, no drag-start handler, and a non-drag cursor.
4. Reject plan entries defensively inside the drag-start handler.
5. Render list plan entries as non-interactive containers; retain existing links for real events.
6. Add the `planned` status label `برنامه انتشار`.

## Task 4: Verify And Commit Locally

Run:

```bash
npm test -- src/app/api/calendar/route.test.ts "src/app/(panel)/calendar/page.test.tsx" src/lib/calendar-conflicts.test.ts
npm run typecheck
npx eslint src/lib/calendar-plan.ts src/app/api/calendar/route.ts src/app/api/calendar/route.test.ts "src/app/(panel)/calendar/page.tsx" "src/app/(panel)/calendar/page.test.tsx" src/components/ui.tsx src/lib/calendar-conflicts.ts src/lib/calendar-conflicts.test.ts
git diff --check
```

Inspect the final diff to confirm there are no database, migration, notification, worker, push, or deployment changes. Commit the complete change as one new commit without amending existing commits.
