# Workflow Google Sheet Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the current public Google Sheet once through a secure, preview-first, duplicate-aware, transactional workflow.

**Architecture:** A server-only fetch adapter obtains a bounded CSV snapshot from allowlisted Google hosts. Pure parsing/mapping code creates a preview; a persisted expiring snapshot plus signed token binds the approved data and decisions. Commit writes operational records atomically while preserving an independent failure report.

**Tech Stack:** Next.js 16, TypeScript, native `fetch`/Web Streams, Node crypto, Drizzle/PostgreSQL, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-content-workflow-design.md`

## Global Constraints

- Phases 1 and 2 must be complete.
- Accept only `docs.google.com` public Sheet URLs; revalidate every redirect host.
- Timeout is 15 seconds, redirect limit 3, CSV limit 5 MiB, row limit 10,000, column limit 200.
- Preview never mutates programs/deliverables/publications.
- Commit consumes the exact stored snapshot/hash; it never refetches the Sheet.
- Unknown cells block their row until mapped or explicitly skipped.
- Operational import is all-or-nothing; failure batch/report survives rollback.

---

### Task 1: Safe Sheet URL Parsing and Bounded Fetch

**Files:**
- Create: `src/lib/workflow/import/sheet-fetch.ts`
- Test: `src/lib/workflow/import/sheet-fetch.test.ts`

**Interfaces:**
- Produces `parsePublicSheetUrl(url)`, `buildSheetCsvUrl(ref)`, `fetchSheetCsv(ref, dependencies)`.

- [ ] **Step 1: Write failing security tests**

```ts
expect(parsePublicSheetUrl("https://docs.google.com/spreadsheets/d/abc123/edit#gid=42")).toEqual({ sheetId: "abc123", gid: "42" });
expect(() => parsePublicSheetUrl("https://evil.test/spreadsheets/d/abc")).toThrow(/Google Sheet/);
await expect(fetchSheetCsv(ref, depsRedirectingTo("https://evil.test/data"))).rejects.toThrow(/redirect/);
await expect(fetchSheetCsv(ref, depsWithBytes(5 * 1024 * 1024 + 1))).rejects.toThrow(/حجم/);
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/workflow/import/sheet-fetch.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement manual redirects, abort, and stream limit**

Use `redirect: "manual"`, validate `new URL(location, currentUrl).hostname === "docs.google.com"` on each hop, abort after 15 seconds, and stop reading once bytes exceed 5 MiB. Do not include the full source URL or response body in thrown errors.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/lib/workflow/import/sheet-fetch.test.ts`

Expected: PASS.

```bash
git add src/lib/workflow/import/sheet-fetch.ts src/lib/workflow/import/sheet-fetch.test.ts
git commit -m "feat: securely fetch public workflow sheets"
```

### Task 2: RFC 4180 Parser, Header Mapping, and Persian Status Normalization

**Files:**
- Create: `src/lib/workflow/import/csv-parser.ts`
- Create: `src/lib/workflow/import/normalization.ts`
- Create: `src/lib/workflow/import/mapper.ts`
- Test: `src/lib/workflow/import/csv-parser.test.ts`
- Test: `src/lib/workflow/import/mapper.test.ts`

**Interfaces:**
- Produces `parseCsv(text, limits)`, `normalizeWorkflowTitle()`, `suggestColumnMapping(headers)`, `mapSheetRows(rows, mapping)`.

- [ ] **Step 1: Write failing parser and mapper tests**

```ts
expect(parseCsv('نام,"عنوان، کامل"\r\nفرات,"متن\nدوخطی"', limits)).toEqual([["نام", "عنوان، کامل"], ["فرات", "متن\nدوخطی"]]);
expect(normalizeWorkflowTitle("  فرات   قسمت ۳۱ ")).toBe("فرات قسمت 31");
expect(mapCell("کامل", { kind: "publication", platform: "youtube" })).toMatchObject({ status: "published", terminalOwner: "imported" });
expect(mapCell("اصلاح شود", { kind: "publication", deliverableName: "ریلز ۱" })).toMatchObject({ productionStatus: "changes_requested" });
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/workflow/import/csv-parser.test.ts src/lib/workflow/import/mapper.test.ts`

Expected: FAIL for missing modules.

- [ ] **Step 3: Implement a state-machine CSV parser**

Handle quoted commas, escaped quotes, CRLF/LF, embedded line breaks, BOM, empty trailing cells, and formula text without evaluation. Reject more than 10,000 rows or 200 columns.

- [ ] **Step 4: Implement deterministic header/status mapping**

Group headers such as `ریلز ۱ در تلگرام` and `ریلز 1 در یوتیوب` under one normalized deliverable. Return unknown cells as `{ kind: "unknown", raw, row, column }`; do not silently map them.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/lib/workflow/import/csv-parser.test.ts src/lib/workflow/import/mapper.test.ts`

Expected: PASS.

```bash
git add src/lib/workflow/import
git commit -m "feat: parse and map workflow sheet data"
```

### Task 3: Persisted Preview Snapshot and Token

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0003_workflow_import_previews.sql`
- Create: `src/lib/workflow/import/preview.ts`
- Test: `src/lib/workflow/import/preview.test.ts`

**Interfaces:**
- Produces `createImportPreview()`, `loadVerifiedPreview(token)`, `expireImportPreviews(now)`.

- [ ] **Step 1: Write failing snapshot integrity tests**

```ts
const preview = await service.createImportPreview({ csv, mapping, actorUserId: "u1" });
expect(await service.loadVerifiedPreview(preview.token)).toMatchObject({ csvHash: sha256(csv), actorUserId: "u1" });
await expect(service.loadVerifiedPreview(tamper(preview.token))).rejects.toMatchObject({ code: "INVALID_PREVIEW" });
clock.advance({ minutes: 31 });
await expect(service.loadVerifiedPreview(preview.token)).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/workflow/import/preview.test.ts`

Expected: FAIL because preview persistence is absent.

- [ ] **Step 3: Add preview table and migration**

Store ID, actor, encrypted-or-server-only CSV snapshot, SHA-256 hash, mapping JSON, decisions JSON, created/expires/consumed timestamps. Index expiry. Token contains preview ID, actor ID, hash, expiry and is signed with `JWT_SECRET`; it does not contain CSV.

- [ ] **Step 4: Implement single-use verification**

Verify signature, actor, expiry, database hash, and `consumedAt=null`. Mark consumed only inside successful commit transaction; failed attempts remain retryable until expiry.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/lib/workflow/import/preview.test.ts src/db/workflow-schema.test.ts`

Expected: PASS.

```bash
git add src/db/schema.ts drizzle/0003_workflow_import_previews.sql src/lib/workflow/import/preview.ts src/lib/workflow/import/preview.test.ts
git commit -m "feat: persist workflow import previews"
```

### Task 4: Duplicate Diff and Transactional Import Commit

**Files:**
- Create: `src/lib/workflow/import/import-service.ts`
- Test: `src/lib/workflow/import/import-service.test.ts`
- Modify: `src/lib/workflow/repository.ts`

**Interfaces:**
- Produces `previewWorkflowImport(command)` and `commitWorkflowImport(command)`.

- [ ] **Step 1: Write failing duplicate/rollback tests**

```ts
expect(preview.duplicates[0]).toMatchObject({ normalizedTitle: "فرات قسمت 31", candidates: [{ programId: "p1" }] });
await expect(service.commit({ token, rows: [{ action: "update" }] })).rejects.toMatchObject({ code: "PROGRAM_SELECTION_REQUIRED" });
port.failOnRow(3);
await expect(service.commit(validCommand)).rejects.toMatchObject({ code: "IMPORT_FAILED" });
expect(port.programs).toHaveLength(0);
expect(port.batches[0].status).toBe("failed");
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/workflow/import/import-service.test.ts`

Expected: FAIL because import service is missing.

- [ ] **Step 3: Implement explicit diff decisions**

For update, require exact `programId` and deliverable IDs selected in preview. Never use title alone as update key. Missing cells do nothing. Unknown cells require a mapped value or `skipCell=true`. Block overwriting newer or terminal state unless command includes manager override and reason.

- [ ] **Step 4: Implement two-transaction failure reporting**

Create batch first. In a second transaction write all operational records and consume preview. On failure rollback it fully, then update batch/results to `failed` in a separate transaction with safe row errors.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/lib/workflow/import/import-service.test.ts`

Expected: PASS.

```bash
git add src/lib/workflow/import src/lib/workflow/repository.ts
git commit -m "feat: add transactional workflow sheet import"
```

### Task 5: Import APIs and Wizard

**Files:**
- Create: `src/app/api/workflow/import/preview/route.ts`
- Create: `src/app/api/workflow/import/preview/route.test.ts`
- Create: `src/app/api/workflow/import/commit/route.ts`
- Create: `src/app/api/workflow/import/commit/route.test.ts`
- Create: `src/app/(panel)/workflow/import/page.tsx`
- Create: `src/components/workflow/ImportWizard.tsx`

**Interfaces:**
- Produces `POST /api/workflow/import/preview`, `POST /api/workflow/import/commit`, and `/workflow/import`.

- [ ] **Step 1: Write failing route permission and error tests**

```ts
expect((await handlePreview(request, deniedDeps)).status).toBe(403);
expect((await handleCommit(expiredRequest, deps)).status).toBe(410);
expect((await handleCommit(conflictRequest, deps)).status).toBe(409);
```

- [ ] **Step 2: Run route tests and confirm failure**

Run: `npm test -- src/app/api/workflow/import`

Expected: FAIL because route modules are missing.

- [ ] **Step 3: Implement `import_workflow` guarded handlers**

Validate URL/mapping/decisions with Zod. Return safe per-row warnings; map expired preview to 410, duplicate/terminal conflict to 409, invalid mapping to 422.

- [ ] **Step 4: Implement the preview-first wizard**

Steps: Sheet URL, column mapping, all-row preview, duplicate/unknown decisions, confirmation, result report. No commit button is enabled while any row has an unresolved unknown or duplicate update.

- [ ] **Step 5: Run complete verification and commit**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: import API and `/workflow/import` build successfully.

```bash
git add src/app/api/workflow/import src/app/(panel)/workflow/import src/components/workflow/ImportWizard.tsx
git commit -m "feat: add workflow sheet import wizard"
```
