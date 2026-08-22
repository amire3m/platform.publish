# Workflow Publishing and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect workflow publications to stable content targets, make scheduling target-aware, reconcile worker results, and deliver idempotent dashboard/Telegram notifications.

**Architecture:** A shared persisted-target type carries `workflow_publication_id`. Target writes remain Telegram-first through `updateContentRecord`; an idempotent adapter mirrors keyed targets to workflow rows and a reconciliation job repairs partial failures. Notifications use a PostgreSQL queue with claims, retries, and stable idempotency keys.

**Tech Stack:** Next.js 16, TypeScript, Drizzle/PostgreSQL, existing TGDB repository, existing YouTube/Instagram providers, Telegram client, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-content-workflow-design.md`

## Global Constraints

- Phases 1–3 must be passing.
- Never match workflow targets by platform/account; require `workflow_publication_id`.
- Never write `content.platformTargets` directly with SQL; use `updateContentRecord`.
- `platformTargets.publish_at_utc` is canonical for linked automatic publications.
- Legacy targets without a workflow key must retain current behavior.
- Telegram storage upload is not public Telegram publication; Telegram workflow status remains manual.
- Target update precedes workflow reflection; reconciliation must be idempotent.
- Notification failure never rolls back a business mutation.

---

### Task 1: Shared Persisted Target Type and Stable Workflow Key

**Files:**
- Create: `src/lib/content-targets.ts`
- Test: `src/lib/content-targets.test.ts`
- Modify: `src/lib/validation.ts`
- Modify: `src/app/api/content/upload/route.ts`
- Modify: `src/lib/worker.ts`

**Interfaces:**
- Produces `PersistedPlatformTarget`, `parsePersistedTargets()`, `targetForWorkflowPublication()`.

- [ ] **Step 1: Write failing key-preservation tests**

```ts
const target = parsePersistedTargets([{ platform: "youtube", account_id: "a1", workflow_publication_id: "wp1", status: "approved" }])[0];
expect(target.workflow_publication_id).toBe("wp1");
expect(targetForWorkflowPublication([target], "wp1")).toBe(target);
expect(targetForWorkflowPublication([target], "missing")).toBeUndefined();
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/content-targets.test.ts`

Expected: FAIL because shared target utilities are missing.

- [ ] **Step 3: Implement one persisted target contract**

Include snake_case storage fields, status/retry/result fields, and optional `workflow_publication_id`. Extend API validation with optional `workflowPublicationId` and map it explicitly during upload/update. Replace private duplicate worker type with the shared type.

- [ ] **Step 4: Run tests and full typecheck**

Run: `npm test -- src/lib/content-targets.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit shared targets**

```bash
git add src/lib/content-targets.ts src/lib/content-targets.test.ts src/lib/validation.ts src/app/api/content/upload/route.ts src/lib/worker.ts
git commit -m "refactor: centralize persisted content targets"
```

### Task 2: Link/Detach Service and Target-Aware Scheduling

**Files:**
- Create: `src/lib/workflow/target-service.ts`
- Test: `src/lib/workflow/target-service.test.ts`
- Modify: `src/app/api/calendar/route.ts`
- Create: `src/app/api/calendar/targets/[publicationId]/reschedule/route.ts`
- Test: `src/app/api/calendar/targets/[publicationId]/reschedule/route.test.ts`
- Modify: `src/app/api/calendar/bulk-reschedule/route.ts`
- Modify: `src/app/(panel)/calendar/page.tsx`

**Interfaces:**
- Produces `linkPublicationTarget()`, `detachPublicationTarget()`, `schedulePublicationTarget()`, `cancelPublicationSchedule()`.

- [ ] **Step 1: Write failing target isolation tests**

```ts
await service.schedulePublicationTarget({ publicationId: "wp2", scheduledAtUtc: iso, actorUserId: "u1", expectedVersion: 2 });
expect(savedTargets.find((target) => target.workflow_publication_id === "wp1")?.publish_at_utc).toBe(oldIso);
expect(savedTargets.find((target) => target.workflow_publication_id === "wp2")?.publish_at_utc).toBe(iso);
expect(workflowMirror.scheduledAt).toBe(iso);
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/workflow/target-service.test.ts`

Expected: FAIL because target service is missing.

- [ ] **Step 3: Implement Telegram-first target mutations**

Load publication/content, enforce account scope and production readiness, find only the exact keyed target, call `updateContentRecord`, then mirror workflow state. Derive content-level schedule from the earliest nonterminal target. Detach requires schedule cancellation and rejects `publishing`.

- [ ] **Step 4: Replace calendar rescheduling with publication identity**

Calendar events include `publicationId`; UI calls `/api/calendar/targets/:publicationId/reschedule`. Bulk requests contain publication IDs, not content IDs. Keep old content route only for legacy events without workflow keys and never call it from workflow events.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- src/lib/workflow/target-service.test.ts src/app/api/calendar/targets/[publicationId]/reschedule/route.test.ts`

Expected: PASS.

```bash
git add src/lib/workflow/target-service.ts src/lib/workflow/target-service.test.ts src/app/api/calendar src/app/(panel)/calendar/page.tsx
git commit -m "feat: make workflow scheduling target aware"
```

### Task 3: Worker Reflection and Reconciliation

**Files:**
- Create: `src/lib/workflow/target-adapter.ts`
- Test: `src/lib/workflow/target-adapter.test.ts`
- Create: `src/lib/workflow/reconciliation.ts`
- Test: `src/lib/workflow/reconciliation.test.ts`
- Modify: `src/lib/worker.ts`

**Interfaces:**
- Produces `reflectTargetState()`, `reconcileWorkflowTargets()`, `WorkflowTargetAdapter`.

- [ ] **Step 1: Write failing mapping and terminal-protection tests**

```ts
expect(mapTargetState({ targetStatus: "failed", productionStatus: "in_progress", terminalOwner: null })).toBe("waiting_for_production");
expect(mapTargetState({ targetStatus: "published", productionStatus: "ready", terminalOwner: "manual" })).toBe("published");
expect(adapter.updatePublication).not.toHaveBeenCalledWith(expect.objectContaining({ terminalOwner: "automatic" }));
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/workflow/target-adapter.test.ts src/lib/workflow/reconciliation.test.ts`

Expected: FAIL because adapter/reconciliation modules are missing.

- [ ] **Step 3: Implement exact status mapping**

When production is not ready, nonterminal publication stays `waiting_for_production`. Otherwise map draft/approved, scheduled, active claim, published, failed, and suppress-origin cancelled exactly as the spec. Never overwrite terminal owner manual/imported; record a safe no-op event.

- [ ] **Step 4: Hook worker claim/result points**

Before provider invocation, reflect `publishing` for keyed targets. After each result, reflect target status/external ID/permalink/safe error. Adapter failure is logged without changing provider outcome.

- [ ] **Step 5: Implement bounded reconciliation**

Query keyed workflow publications in pages of 100, load their content target, and idempotently reflect differences. Missing keyed target creates an actionable warning and does not guess another target.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- src/lib/workflow/target-adapter.test.ts src/lib/workflow/reconciliation.test.ts`

Expected: PASS.

```bash
git add src/lib/workflow/target-adapter.ts src/lib/workflow/target-adapter.test.ts src/lib/workflow/reconciliation.ts src/lib/workflow/reconciliation.test.ts src/lib/worker.ts
git commit -m "feat: reconcile publishing targets with workflow"
```

### Task 4: Notification Queue and Telegram Delivery

**Files:**
- Create: `src/lib/workflow/notifications.ts`
- Test: `src/lib/workflow/notifications.test.ts`
- Create: `src/lib/workflow/notification-scheduler.ts`
- Test: `src/lib/workflow/notification-scheduler.test.ts`
- Create: `src/app/api/workflow/notifications/route.ts`
- Create: `src/app/api/workflow/notifications/read/route.ts`

**Interfaces:**
- Produces `enqueueWorkflowNotification()`, `runWorkflowNotificationDelivery()`, `scheduleWorkflowReminders()`, list/read APIs.

- [ ] **Step 1: Write failing idempotency and recipient tests**

```ts
await enqueueWorkflowNotification(port, event);
await enqueueWorkflowNotification(port, event);
expect(port.notifications).toHaveLength(1);

await deliver({ ...notification, recipientTelegramId: null });
expect(port.notifications[0].status).toBe("skipped_no_recipient");
expect(sendPrivateMessage).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/workflow/notifications.test.ts src/lib/workflow/notification-scheduler.test.ts`

Expected: FAIL because notification services are missing.

- [ ] **Step 3: Implement stable idempotency keys and queue claims**

Use keys such as `assignment:{deliverableId}:{assigneeId}:{version}`, `due24h:{deliverableId}:{dueAt}`, and `failure:{publicationId}:{version}`. Claim with lease, cap attempts at 5, and store only safe payload fields.

- [ ] **Step 4: Implement reminders and daily Tehran digest**

Generate assignment/change/failure immediately, due reminder at 24 hours, and one daily overdue digest at 09:00 `Asia/Tehran`. A deadline change cancels the old due key before adding the new one.

- [ ] **Step 5: Implement list/read endpoints and run tests**

Run: `npm test -- src/lib/workflow/notifications.test.ts src/lib/workflow/notification-scheduler.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit notification delivery**

```bash
git add src/lib/workflow/notifications.ts src/lib/workflow/notifications.test.ts src/lib/workflow/notification-scheduler.ts src/lib/workflow/notification-scheduler.test.ts src/app/api/workflow/notifications
git commit -m "feat: add workflow notifications"
```

### Task 5: Cron Integration, Notification UI, and Final Verification

**Files:**
- Modify: `src/app/api/cron/tick/route.ts`
- Modify: `src/app/api/cron/tick/route.test.ts`
- Modify: `src/instrumentation.ts`
- Create: `src/components/workflow/NotificationCenter.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Adds reconciliation, reminder scheduling, and notification delivery as independent cron jobs.

- [ ] **Step 1: Extend failing cron independence tests**

```ts
expect(runPublishTick).toHaveBeenCalledOnce();
expect(reconcileWorkflowTargets).toHaveBeenCalledOnce();
expect(runWorkflowNotificationDelivery).toHaveBeenCalledOnce();
expect(responseBody.data.notifications.ok).toBe(false);
expect(responseBody.data.publish.ok).toBe(true);
```

- [ ] **Step 2: Run cron tests and confirm failure**

Run: `npm test -- src/app/api/cron/tick/route.test.ts`

Expected: FAIL because new jobs/results are absent.

- [ ] **Step 3: Run jobs independently and secret-safely**

Use `Promise.allSettled`; expose generic job error text only. Instrumentation may invoke the same schedulers with existing overlap guards, while `CRON_SECRET` remains fail-closed for the external route.

- [ ] **Step 4: Add notification center**

Show unread count in `AppShell`, actionable workflow links, mark-one/read-all controls, loading/empty/error states, and `aria-live="polite"` for count changes.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: build exits 0 and workflow/calendar/cron routes are listed.

- [ ] **Step 6: Commit final integration**

```bash
git add src/app/api/cron/tick src/instrumentation.ts src/components/workflow/NotificationCenter.tsx src/components/layout/AppShell.tsx
git commit -m "feat: complete workflow publishing integration"
```
