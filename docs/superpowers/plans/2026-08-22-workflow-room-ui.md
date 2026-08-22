# Workflow Room UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the responsive Persian “اتاق انتشار” matrix, program detail and creation flows, quick workflow actions, and template management UI.

**Architecture:** Client pages consume the phase-one API through one typed fetch helper. Desktop uses an expandable matrix; mobile renders program cards and disclosures. Mutations remain permission-gated by the server and refresh SWR data after success.

**Tech Stack:** Next.js 16, React 19, TypeScript, SWR 2.5, Tailwind CSS 4, lucide-react, Vitest pure helper tests.

**Spec:** `docs/superpowers/specs/2026-08-22-content-workflow-design.md`

## Global Constraints

- Phase 1 must be complete and passing before execution.
- Preserve Persian RTL and existing Telegram-inspired design tokens.
- Mobile must use cards/disclosures, not a horizontally scrolling matrix as its primary view.
- Color is never the only status indicator; show text and icon.
- All dialogs require Escape close, initial focus, focus containment, and focus restoration.
- Do not add a second client state library; use SWR and local React state.

---

### Task 1: Shared Client Contracts and Accessible Dialog Foundation

**Files:**
- Create: `src/lib/workflow/client.ts`
- Create: `src/lib/workflow/presentation.ts`
- Test: `src/lib/workflow/presentation.test.ts`
- Modify: `src/components/ui.tsx`

**Interfaces:**
- Produces `fetchWorkflowApi<T>()`, `workflowStatusPresentation(status)`, and accessible `Modal` behavior.

- [ ] **Step 1: Write failing presentation tests**

```ts
expect(workflowStatusPresentation("changes_requested")).toEqual({ label: "اصلاح شود", tone: "danger", icon: "alert" });
expect(workflowStatusPresentation("published")).toEqual({ label: "منتشرشده", tone: "success", icon: "check" });
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npm test -- src/lib/workflow/presentation.test.ts`

Expected: FAIL because `presentation.ts` is missing.

- [ ] **Step 3: Implement typed API and status mappings**

```ts
export async function fetchWorkflowApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok || !body.ok) throw new WorkflowApiError(body.error ?? "خطای ارتباط با سرور", response.status, body.code);
  return body.data as T;
}
```

- [ ] **Step 4: Upgrade `Modal` semantics and focus behavior**

Add `role="dialog"`, `aria-modal="true"`, generated title ID, initial focus on the first enabled control, Tab/Shift+Tab containment, and focus restoration. Keep the existing API compatible.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- src/lib/workflow/presentation.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit shared UI foundations**

```bash
git add src/lib/workflow/client.ts src/lib/workflow/presentation.ts src/lib/workflow/presentation.test.ts src/components/ui.tsx
git commit -m "feat: add workflow UI foundations"
```

### Task 2: Permission-Aware Navigation and Workflow Room Data Model

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Create: `src/components/workflow/types.ts`
- Create: `src/components/workflow/room-model.ts`
- Test: `src/components/workflow/room-model.test.ts`

**Interfaces:**
- Produces `WorkflowProgramSummary`, `groupWorkflowPrograms()`, `workflowRoomFilters()`.

- [ ] **Step 1: Write failing filter/summary tests**

```ts
expect(filterPrograms(rows, { attentionOnly: true, query: "" }).map((row) => row.id)).toEqual(["late", "failed"]);
expect(filterPrograms(rows, { attentionOnly: false, query: "فرات" })).toHaveLength(1);
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npm test -- src/components/workflow/room-model.test.ts`

Expected: FAIL because the model is missing.

- [ ] **Step 3: Implement typed room transformations**

Keep filtering pure and stable. Use server-provided progress/next action; the client must not recalculate business rules.

- [ ] **Step 4: Add the “اتاق انتشار” nav item**

Fetch `/api/auth/me` in `AppShell`; render `/workflow` with a `ListChecks` icon only when effective permissions include `view_workflow`. Keep existing routes unchanged.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/components/workflow/room-model.test.ts`

Expected: PASS.

```bash
git add src/components/layout/AppShell.tsx src/components/workflow
git commit -m "feat: add workflow navigation and room model"
```

### Task 3: Responsive Workflow Room

**Files:**
- Create: `src/components/workflow/WorkflowSummary.tsx`
- Create: `src/components/workflow/WorkflowFilters.tsx`
- Create: `src/components/workflow/WorkflowMatrix.tsx`
- Create: `src/components/workflow/WorkflowCards.tsx`
- Create: `src/components/workflow/WorkflowDeliverableRows.tsx`
- Create: `src/app/(panel)/workflow/page.tsx`

**Interfaces:**
- Consumes `GET /api/workflow/programs` and phase-one transition endpoints.
- Produces `/workflow` with desktop matrix and mobile cards.

- [ ] **Step 1: Build the page shell and loading/error/empty states**

Use SWR with `fetchWorkflowApi`, `Skeleton`, `ErrorState`, and `EmptyState`. The page heading is “اتاق انتشار”; primary action links to `/workflow/new`.

- [ ] **Step 2: Implement summary and filters**

Expose total active, overall progress, attention count, and due-this-week. Filters include query, attention, stage, assignee, platform, and due window; controls have labels and 44px minimum touch height.

- [ ] **Step 3: Implement desktop matrix**

Columns: program, overall progress, production, Telegram, YouTube, Instagram, deadline, next action. Row toggle is a real button with `aria-expanded` and `aria-controls`; expanded content uses `WorkflowDeliverableRows`.

- [ ] **Step 4: Implement mobile cards**

Hide the matrix below `lg`; show cards containing progress, next action, deadline, destination summaries, and an accessible disclosure for outputs.

- [ ] **Step 5: Verify static build**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: `/workflow` appears and build exits 0.

- [ ] **Step 6: Commit the workflow room**

```bash
git add src/components/workflow src/app/(panel)/workflow/page.tsx
git commit -m "feat: add responsive workflow room"
```

### Task 4: Program Detail and Quick Actions

**Files:**
- Create: `src/components/workflow/WorkflowStatusAction.tsx`
- Create: `src/components/workflow/WorkflowReasonDialog.tsx`
- Create: `src/components/workflow/WorkflowHistory.tsx`
- Create: `src/app/(panel)/workflow/[id]/page.tsx`

**Interfaces:**
- Consumes program detail/history and deliverable/publication transition APIs.

- [ ] **Step 1: Implement program detail loading and 404/permission states**

Use `use(params)` for Next 16 params. Fetch program and `/api/auth/me`; show actions only when the permission is present, while relying on API enforcement.

- [ ] **Step 2: Implement output list and quick transitions**

Show output name, assignee, due date, production state, three destination states, and connected-content indicator. Disable invalid actions based on the server-supplied allowed actions array.

- [ ] **Step 3: Implement reason and conflict handling**

Require reason text for change/cancel/suppress actions. Send `expectedVersion`; on 409 preserve the entered reason, show “اطلاعات توسط کاربر دیگری تغییر کرده است”, refresh, and let the user reapply.

- [ ] **Step 4: Implement history panel**

Render actor, action, safe before/after summary, reason, source, and Persian date. Add entity and actor filters.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck`

Expected: exit 0.

```bash
git add src/components/workflow src/app/(panel)/workflow/[id]/page.tsx
git commit -m "feat: add workflow program detail actions"
```

### Task 5: Program Creation and Template Management

**Files:**
- Create: `src/app/(panel)/workflow/new/page.tsx`
- Create: `src/app/(panel)/workflow/templates/page.tsx`
- Create: `src/components/workflow/ProgramWizard.tsx`
- Create: `src/components/workflow/TemplateEditor.tsx`
- Create: `src/lib/workflow/draft.ts`
- Test: `src/lib/workflow/draft.test.ts`

**Interfaces:**
- Produces template-or-blank creation, editable pre-save outputs, and template CRUD UI.

- [ ] **Step 1: Write failing draft snapshot tests**

```ts
const draft = draftFromTemplate(template);
template.items[0].name = "تغییر یافته";
expect(draft.deliverables[0].name).toBe("ویدیوی کامل");
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npm test -- src/lib/workflow/draft.test.ts`

Expected: FAIL because `draftFromTemplate` is missing.

- [ ] **Step 3: Implement immutable template snapshots**

Generate client draft IDs, deep-copy items/destinations, calculate due dates from offsets, and permit add/remove/reorder before save.

- [ ] **Step 4: Implement creation wizard and review**

Steps: template/blank, program metadata, outputs/assignees/deadlines, destinations, review/save. Persist only on final save.

- [ ] **Step 5: Implement template admin page**

Require `manage_workflow_templates`; support create, reorder, archive, item destinations, and due offsets. Confirm archive when a template has existing instances.

- [ ] **Step 6: Run complete verification and commit**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: workflow room, detail, new, and templates routes build successfully.

```bash
git add src/app/(panel)/workflow src/components/workflow src/lib/workflow/draft.ts src/lib/workflow/draft.test.ts
git commit -m "feat: add workflow creation and templates UI"
```
