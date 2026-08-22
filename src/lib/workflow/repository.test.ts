import { describe, expect, it, beforeEach } from "vitest";
import { createWorkflowRepository, InMemoryWorkflowPort, WorkflowRepositoryError } from "./repository";
import { generateEntityId } from "@/lib/ids";

describe("workflow repository transactional behavior", () => {
  it("creates the entity and event atomically", async () => {
    const port = new InMemoryWorkflowPort();
    const repo = createWorkflowRepository(port);
    await repo.createProgram({ id: "WPR-1405-000001", title: "فرات ۳۱", actorUserId: "u1" });
    expect(port.programs).toHaveLength(1);
    expect(port.events).toMatchObject([{ entityType: "workflow_program", action: "created" }]);
  });

  it("rejects a stale expected version without writing an event", async () => {
    const port = new InMemoryWorkflowPort();
    const repo = createWorkflowRepository(port);
    // seed a program with version 2 directly via port
    const now = new Date();
    const program = {
      id: "p1",
      title: "قدیمی",
      seriesName: null,
      ownerUserId: null,
      dueAt: null,
      notes: null,
      source: "manual",
      sourceRef: null,
      version: 2,
      createdBy: "u1",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const seedEvent = {
      id: generateEntityId("WEV"),
      entityType: "workflow_program",
      entityId: "p1",
      action: "created",
      before: null,
      after: { ...program } as unknown as Record<string, unknown>,
      actorUserId: "u1",
      source: "api",
      reason: null,
      createdAt: now,
    };
    await port.transactCreateProgram(program as never, seedEvent as never);
    port.events = []; // reset to observe only next mutation
    await expect(repo.updateProgram({ id: "p1", expectedVersion: 1, title: "جدید", actorUserId: "u1" })).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(port.events).toHaveLength(0);
    // ensure program untouched
    const still = await port.getProgram("p1");
    expect(still?.title).toBe("قدیمی");
    expect(still?.version).toBe(2);
  });

  it("creates deliverable and publication via template instantiation atomically", async () => {
    const port = new InMemoryWorkflowPort();
    const repo = createWorkflowRepository(port);
    const program = await repo.createProgram({ id: "WPR-1405-000010", title: "برنامه الگو", actorUserId: "u1" });
    const template = await repo.createTemplate({
      name: "الگوی تست",
      actorUserId: "u1",
      items: [
        { name: "ریلز ۱", destinations: [{ platform: "telegram" }, { platform: "youtube" }], dueOffsetMinutes: 60 },
        { name: "پست ۱", destinations: [{ platform: "instagram" }], dueOffsetMinutes: 120 },
      ],
    });
    const deliverables = await repo.instantiateTemplate({
      templateId: template.id,
      programId: program.id,
      actorUserId: "u1",
      baseDueAt: new Date("2026-08-22T10:00:00Z"),
    });
    expect(deliverables).toHaveLength(2);
    expect(port.deliverables).toHaveLength(2);
    // 3 publications total
    expect(port.publications).toHaveLength(3);
    expect(port.events.length).toBeGreaterThan(0);
  });

  it("transitions deliverable using state machine and preserves version check", async () => {
    const port = new InMemoryWorkflowPort();
    const repo = createWorkflowRepository(port);
    await repo.createProgram({ id: "WPR-1405-000020", title: "پروژه", actorUserId: "u1" });
    const d = await repo.createDeliverable({ programId: "WPR-1405-000020", name: "خروجی ۱", actorUserId: "u1" });
    expect(d.productionStatus).toBe("not_started");
    const d2 = await repo.transitionDeliverable({
      id: d.id,
      expectedVersion: 1,
      action: "start",
      actor: "assignee",
      actorUserId: "u1",
    });
    expect(d2.productionStatus).toBe("in_progress");
    expect(d2.version).toBe(2);
    // stale version should fail without event
    const eventsBefore = port.events.length;
    await expect(
      repo.transitionDeliverable({
        id: d.id,
        expectedVersion: 1,
        action: "submit_review",
        actor: "assignee",
        actorUserId: "u1",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(port.events).toHaveLength(eventsBefore);
  });

  it("requires reason for request_changes and does not write event on invalid transition", async () => {
    const port = new InMemoryWorkflowPort();
    const repo = createWorkflowRepository(port);
    await repo.createProgram({ id: "WPR-1405-000030", title: "پروژه", actorUserId: "u1" });
    const d = await repo.createDeliverable({ programId: "WPR-1405-000030", name: "خروجی ۲", actorUserId: "u1" });
    await repo.transitionDeliverable({ id: d.id, expectedVersion: 1, action: "start", actor: "assignee", actorUserId: "u1" });
    await repo.transitionDeliverable({ id: d.id, expectedVersion: 2, action: "submit_review", actor: "assignee", actorUserId: "u1" });
    const eventsBefore = port.events.length;
    await expect(
      repo.transitionDeliverable({ id: d.id, expectedVersion: 3, action: "request_changes", actor: "manager", actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    expect(port.events).toHaveLength(eventsBefore);
    // with reason succeeds
    const d3 = await repo.transitionDeliverable({
      id: d.id,
      expectedVersion: 3,
      action: "request_changes",
      actor: "manager",
      reason: "کیفیت پایین",
      actorUserId: "u1",
    });
    expect(d3.productionStatus).toBe("changes_requested");
  });

  it("transitions publication only when production ready", async () => {
    const port = new InMemoryWorkflowPort();
    const repo = createWorkflowRepository(port);
    await repo.createProgram({ id: "WPR-1405-000040", title: "پروژه", actorUserId: "u1" });
    const d = await repo.createDeliverable({ programId: "WPR-1405-000040", name: "خروجی ۳", actorUserId: "u1" });
    // manually seed a publication for this deliverable
    const pubId = "WPB-1405-000001";
    const now = new Date();
    const pub = {
      id: pubId,
      deliverableId: d.id,
      platform: "youtube",
      socialAccountId: null,
      status: "waiting_for_production" as const,
      createdSource: "manual",
      terminalOwner: null,
      scheduledAt: null,
      publishedAt: null,
      externalId: null,
      permalink: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      manualReason: null,
      version: 1,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    // push directly to in-memory maps for test setup
    (port as unknown as { publicationMap: Map<string, unknown> }).publicationMap.set(pubId, pub as never);
    (port.publications as unknown[]).push(pub as never);
    // attempt schedule before production ready -> should fail with PRODUCTION_NOT_READY
    await expect(
      repo.transitionPublication({
        id: pubId,
        expectedVersion: 1,
        action: "schedule",
        actor: "publisher",
        actorUserId: "u1",
        automaticTargetReady: true,
      }),
    ).rejects.toMatchObject({ code: "PRODUCTION_NOT_READY" });
    expect(port.events.filter((e) => e.entityId === pubId)).toHaveLength(0);
  });

  it("getProgram derives progress and next action", async () => {
    const port = new InMemoryWorkflowPort();
    const repo = createWorkflowRepository(port);
    await repo.createProgram({ id: "WPR-1405-000050", title: "برنامه پیشرفت", actorUserId: "u1" });
    const d1 = await repo.createDeliverable({ programId: "WPR-1405-000050", name: "خروجی A", actorUserId: "u1" });
    await repo.transitionDeliverable({ id: d1.id, expectedVersion: 1, action: "start", actor: "assignee", actorUserId: "u1" });
    await repo.transitionDeliverable({ id: d1.id, expectedVersion: 2, action: "submit_review", actor: "assignee", actorUserId: "u1" });
    await repo.transitionDeliverable({ id: d1.id, expectedVersion: 3, action: "approve", actor: "manager", actorUserId: "u1" });
    const detail = await repo.getProgram("WPR-1405-000050");
    expect(detail).not.toBeNull();
    expect(detail?.progress.completedUnits).toBe(1);
    expect(detail?.progress.totalUnits).toBe(1);
  });

  it("listPrograms filters and getProgram returns null for missing", async () => {
    const port = new InMemoryWorkflowPort();
    const repo = createWorkflowRepository(port);
    await repo.createProgram({ id: "WPR-1405-000060", title: "فرات ۳۱", actorUserId: "u1" });
    await repo.createProgram({ id: "WPR-1405-000061", title: "پروژه دیگر", actorUserId: "u1" });
    const list = await repo.listPrograms({ search: "فرات" });
    expect(list).toHaveLength(1);
    expect(await repo.getProgram("missing")).toBeNull();
  });
});
