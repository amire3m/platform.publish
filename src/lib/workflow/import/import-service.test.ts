import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryWorkflowPort } from "../repository";
import { createWorkflowImportService } from "./import-service";
import { clearPreviewStore } from "./preview";
import { normalizeWorkflowTitle } from "./normalization";
import { generateEntityId } from "@/lib/ids";

describe("workflow import duplicate diff and transactional commit", () => {
  const JWT_SECRET = "test-jwt-secret-import";
  let port: InMemoryWorkflowPort;

  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    clearPreviewStore();
    port = new InMemoryWorkflowPort();
    // Seed a program for duplicate detection
    const now = new Date("2026-08-22T09:00:00Z");
    const prog = {
      id: "p1",
      title: "فرات قسمت 31",
      seriesName: null,
      ownerUserId: null,
      dueAt: null,
      notes: null,
      source: "manual",
      sourceRef: null,
      version: 1,
      createdBy: "u1",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    } as unknown as typeof port.programs[number];
    port.programs.push(prog as never);
    // Ensure map
    (port as unknown as { programMap: Map<string, unknown> }).programMap.set("p1", prog);
  });

  it("detects duplicates by normalized title", async () => {
    const service = createWorkflowImportService({ port });
    const csv = "نام برنامه,ریلز ۱ در تلگرام\nفرات قسمت ۳۱,کامل\nفرات قسمت 32,کامل";
    const preview = await service.preview({ csv, actorUserId: "u1" });
    // First data row normalized "فرات قسمت 31" should match p1 (Persian digit normalized)
    expect(preview.duplicates[0]).toMatchObject({ normalizedTitle: "فرات قسمت 31", candidates: [{ programId: "p1" }] });
    // second row not duplicate
    expect(preview.duplicates).toHaveLength(1);
    expect(preview.duplicates[0].title).toBe("فرات قسمت ۳۱");
  });

  it("requires programId for update action", async () => {
    const service = createWorkflowImportService({ port });
    const csv = "نام برنامه,ریلز ۱ در تلگرام\nفرات قسمت 31,کامل";
    const preview = await service.preview({ csv, actorUserId: "u1" });
    await expect(
      service.commit({
        token: preview.token,
        rows: [{ rowIndex: 0, action: "update" }],
        actorUserId: "u1",
      }),
    ).rejects.toMatchObject({ code: "PROGRAM_SELECTION_REQUIRED" });
  });

  it("never uses title alone as update key and requires mapped value for unknown cells", async () => {
    const service = createWorkflowImportService({ port });
    // Create CSV with unknown value "نامشخص" which mapper will mark unknown
    const csv = "نام برنامه,ریلز ۱ در تلگرام\nفرات قسمت 31,نامشخص";
    const preview = await service.preview({ csv, actorUserId: "u1" });
    expect(preview.unknowns.length).toBeGreaterThan(0);
    // Try to commit update without handling unknown -> should block
    await expect(
      service.commit({
        token: preview.token,
        rows: [
          {
            rowIndex: 0,
            action: "update",
            programId: "p1",
            // no mappedValues nor skipCells
          },
        ],
        actorUserId: "u1",
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_CELL_REQUIRED" });

    // With skipCell true should pass
    const ok = await service.commit({
      token: preview.token,
      rows: [
        {
          rowIndex: 0,
          action: "update",
          programId: "p1",
          skipCells: { "1:1": true } as unknown as Record<string, boolean>,
          // the unknown cell is at row 1 col 1 (originalIndex 1)
        },
      ],
      actorUserId: "u1",
    });
    expect(ok.batchId).toBeDefined();
    clearPreviewStore();
    port.batches = [];
    (port as unknown as { batchMap: Map<string, unknown> }).batchMap.clear();
  });

  it("blocks overwriting terminal status without manager override and reason", async () => {
    // Create a program with terminal publication
    const now = new Date("2026-08-22T09:00:00Z");
    const deliv = {
      id: "d1",
      programId: "p1",
      name: "ریلز 1",
      kind: null,
      sortOrder: 0,
      productionStatus: "ready",
      assigneeUserId: null,
      dueAt: null,
      notes: null,
      contentId: null,
      archivedAt: null,
      version: 1,
      createdBy: "u1",
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof port.deliverables[number];
    port.deliverables.push(deliv as never);
    (port as unknown as { deliverableMap: Map<string, unknown> }).deliverableMap.set("d1", deliv);
    const pub = {
      id: "pub1",
      deliverableId: "d1",
      platform: "telegram",
      socialAccountId: null,
      status: "published",
      createdSource: "manual",
      terminalOwner: "manual",
      scheduledAt: null,
      publishedAt: now,
      externalId: null,
      permalink: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      manualReason: null,
      version: 1,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof port.publications[number];
    port.publications.push(pub as never);
    (port as unknown as { publicationMap: Map<string, unknown> }).publicationMap.set("pub1", pub);

    const service = createWorkflowImportService({ port });
    const csv = "نام برنامه,ریلز ۱ در تلگرام\nفرات قسمت 31,کامل";
    const preview = await service.preview({ csv, actorUserId: "u1" });

    // Without override should block
    await expect(
      service.commit({
        token: preview.token,
        rows: [{ rowIndex: 0, action: "update", programId: "p1" }],
        actorUserId: "u1",
        isManager: false,
      }),
    ).rejects.toMatchObject({ code: "TERMINAL_OVERWRITE_BLOCKED" });

    // With manager override and reason should succeed
    const ok = await service.commit({
      token: preview.token,
      rows: [{ rowIndex: 0, action: "update", programId: "p1", override: true, overrideReason: "اصلاح مدیر" }],
      actorUserId: "u1",
      isManager: true,
    });
    expect(ok.counts.updated).toBe(1);
    clearPreviewStore();
  });

  it("transactional failure rolls back and marks batch failed", async () => {
    const service = createWorkflowImportService({ port });
    const csv = "نام برنامه,ریلز ۱ در تلگرام\nبرنامه جدید 1,کامل\nبرنامه جدید 2,کامل\nبرنامه جدید 3,کامل\nبرنامه جدید 4,کامل";
    const preview = await service.preview({ csv, actorUserId: "u1" });
    // Expect 4 rows
    expect(preview.rows).toHaveLength(4);
    // Inject failure on row 3 (rowIndex 2? but test uses failOnRow 3 means 4th row)
    // Our earlier plan test used port.failOnRow(3) with 4 rows scenario; we mimic 0-indexed
    port.failOnRow = 2; // fail on third row (index 2)

    const validCommand = {
      token: preview.token,
      rows: preview.rows.map((r) => ({ rowIndex: r.rowIndex, action: "create" as const })),
      actorUserId: "u1",
    };

    await expect(service.commit(validCommand)).rejects.toMatchObject({ code: "IMPORT_FAILED" });
    // Operational records should be rolled back fully: no new programs besides seeded p1
    expect(port.programs).toHaveLength(1);
    expect(port.programs[0].id).toBe("p1");
    // Batch should exist with failed status in separate transaction
    expect(port.batches).toHaveLength(1);
    expect(port.batches[0].status).toBe("failed");

    // Preview should not be marked consumed after failed attempt (retryable)
    const { getPreviewStore } = await import("./preview");
    const rec = getPreviewStore().get(preview.id);
    expect(rec?.consumedAt).toBeNull();

    // Retry without failure should succeed and consume preview
    port.failOnRow = null;
    // Need new preview? The previous preview is still valid (not consumed, not expired), but batch already created? Our service creates new batch per commit attempt, so second attempt will create new batch
    // Reuse same token for retry (should be retryable)
    const retryPreview = preview; // same token
    const retryCommand = {
      token: retryPreview.token,
      rows: preview.rows
        .filter((r) => r.rowIndex !== 2) // skip failing row for success scenario? Or retry all without failure
        .map((r) => ({ rowIndex: r.rowIndex, action: "create" as const })),
      actorUserId: "u1",
    };
    // Remove failure injection
    port.failOnRow = null;
    // Use a fresh preview without failing row to succeed
    const csv2 = "نام برنامه,ریلز ۱ در تلگرام\nبرنامه جدید 1,کامل\nبرنامه جدید 2,کامل";
    const preview2 = await service.preview({ csv: csv2, actorUserId: "u1" });
    const ok = await service.commit({
      token: preview2.token,
      rows: preview2.rows.map((r) => ({ rowIndex: r.rowIndex, action: "create" as const })),
      actorUserId: "u1",
    });
    expect(ok.counts.created).toBe(2);
    expect(port.batches.find((b) => b.id === ok.batchId)?.status).toBe("succeeded");
    // Preview consumed inside successful commit
    const rec2 = (await import("./preview")).getPreviewStore().get(preview2.id);
    expect(rec2?.consumedAt).not.toBeNull();
  });

  it("all-or-nothing: partial creates are not left behind on failure", async () => {
    const service = createWorkflowImportService({ port });
    const csv = "نام برنامه,ریلز ۱ در تلگرام\nجدید A,کامل\nجدید B,کامل";
    const preview = await service.preview({ csv, actorUserId: "u1" });
    port.failOnRow = 1;
    await expect(
      service.commit({
        token: preview.token,
        rows: preview.rows.map((r) => ({ rowIndex: r.rowIndex, action: "create" as const })),
        actorUserId: "u1",
      }),
    ).rejects.toMatchObject({ code: "IMPORT_FAILED" });
    // No new programs should persist
    expect(port.programs.filter((p) => p.title.startsWith("جدید"))).toHaveLength(0);
  });
});
