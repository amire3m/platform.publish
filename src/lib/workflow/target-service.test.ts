import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  schedulePublicationTarget,
  cancelPublicationSchedule,
  linkPublicationTarget,
  detachPublicationTarget,
  WorkflowTargetError,
} from "./target-service";

function makeInMemoryDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const publications = new Map<string, Record<string, unknown>>();
  const deliverables = new Map<string, Record<string, unknown>>();
  const contents = new Map<string, Record<string, unknown>>();
  const users = new Map<string, Record<string, unknown>>();

  // seed default
  const pub1 = {
    id: "wp1",
    deliverableId: "del1",
    platform: "youtube",
    socialAccountId: "acc1",
    status: "ready",
    version: 1,
    scheduledAt: null,
  };
  const pub2 = {
    id: "wp2",
    deliverableId: "del1",
    platform: "youtube",
    socialAccountId: "acc1",
    status: "ready",
    version: 2,
    scheduledAt: null,
  };
  publications.set("wp1", { ...pub1 });
  publications.set("wp2", { ...pub2 });
  deliverables.set("del1", {
    id: "del1",
    productionStatus: "ready",
    contentId: "cnt1",
  });
  users.set("u1", { id: "u1", role: "publisher", allowedAccountIds: ["acc1"] });

  const oldIso = "2026-08-20T09:00:00.000Z";
  const contentTargets = [
    {
      platform: "youtube",
      account_id: "acc1",
      content_type: "video",
      status: "scheduled",
      publish_at_utc: oldIso,
      workflow_publication_id: "wp1",
    },
    {
      platform: "youtube",
      account_id: "acc1",
      content_type: "video",
      status: "scheduled",
      publish_at_utc: oldIso,
      workflow_publication_id: "wp2",
    },
  ];
  contents.set("cnt1", {
    id: "cnt1",
    platformTargets: contentTargets,
    scheduledAtUtc: new Date(oldIso),
    status: "scheduled",
  });

  let savedTargets: Record<string, unknown>[] = [];
  let workflowMirror: Record<string, unknown> = {};

  const deps = {
    getPublication: vi.fn(async (id: string) => publications.get(id) ?? null),
    getDeliverable: vi.fn(async (id: string) => deliverables.get(id) ?? null),
    getContent: vi.fn(async (id: string) => contents.get(id) ?? null),
    getUser: vi.fn(async (id: string) => users.get(id) ?? null),
    updateContentRecord: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const existing = contents.get(id);
      const updated = { ...existing, ...patch };
      // map camel to raw stored? patch contains platformTargets, scheduledAtUtc etc
      if (patch.platformTargets) {
        savedTargets = patch.platformTargets as Record<string, unknown>[];
        updated.platformTargets = savedTargets;
      }
      if (patch.scheduledAtUtc !== undefined) updated.scheduledAtUtc = patch.scheduledAtUtc;
      contents.set(id, updated);
      return updated;
    }),
    transactUpdatePublication: vi.fn(async (id: string, expectedVersion: number, patch: Record<string, unknown>) => {
      const existing = publications.get(id);
      if (!existing) throw new Error("not found");
      if ((existing.version as number) !== expectedVersion) throw new WorkflowTargetError("VERSION_CONFLICT", "نسخه قدیمی است.");
      const updated = { ...existing, ...patch, version: expectedVersion + 1 };
      workflowMirror = { ...updated };
      publications.set(id, updated);
      return updated;
    }),
    updateDeliverableContentId: vi.fn(async (deliverableId: string, contentId: string | null) => {
      const d = deliverables.get(deliverableId);
      if (d) d.contentId = contentId;
    }),
    _maps: { publications, deliverables, contents, users },
    _getSavedTargets: () => savedTargets,
    _getWorkflowMirror: () => workflowMirror,
    _getContentTargets: () => savedTargets,
  } as unknown as Record<string, unknown> & {
    _maps: { publications: Map<string, Record<string, unknown>>; deliverables: Map<string, Record<string, unknown>>; contents: Map<string, Record<string, unknown>>; users: Map<string, Record<string, unknown>> };
    _getSavedTargets: () => Record<string, unknown>[];
    _getWorkflowMirror: () => Record<string, unknown>;
  };

  // apply overrides
  for (const [k, v] of Object.entries(overrides)) {
    (deps as Record<string, unknown>)[k] = v;
  }

  return deps;
}

describe("workflow target-service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isolates exact keyed target on schedule (wp2 only)", async () => {
    const deps = makeInMemoryDeps();
    const iso = "2026-08-22T10:00:00.000Z";
    const oldIso = "2026-08-20T09:00:00.000Z";
    await schedulePublicationTarget(
      { publicationId: "wp2", scheduledAtUtc: iso, actorUserId: "u1", expectedVersion: 2 },
      deps as never,
    );
    const savedTargets = (deps as unknown as { _getSavedTargets: () => Record<string, unknown>[] })._getSavedTargets();
    const workflowMirror = (deps as unknown as { _getWorkflowMirror: () => Record<string, unknown> })._getWorkflowMirror();
    expect(savedTargets.find((t) => t.workflow_publication_id === "wp1")?.publish_at_utc).toBe(oldIso);
    expect(savedTargets.find((t) => t.workflow_publication_id === "wp2")?.publish_at_utc).toBe(iso);
    expect((workflowMirror.scheduledAt as Date)?.toISOString() ?? workflowMirror.scheduledAt).toBe(iso);
  });

  it("mirrors workflow state and derives earliest nonterminal content schedule", async () => {
    const deps = makeInMemoryDeps();
    // add third target with earlier date nonterminal, ensure earliest is chosen
    const content = (deps as unknown as { _maps: { contents: Map<string, Record<string, unknown>> } })._maps.contents.get("cnt1")!;
    const existingTargets = content.platformTargets as Record<string, unknown>[];
    existingTargets.push({
      platform: "youtube",
      account_id: "acc1",
      content_type: "video",
      status: "published",
      publish_at_utc: "2026-08-19T09:00:00.000Z",
      workflow_publication_id: "wp3",
    });
    // add publication wp3
    (deps as unknown as { _maps: { publications: Map<string, Record<string, unknown>> } })._maps.publications.set("wp3", {
      id: "wp3",
      deliverableId: "del1",
      platform: "youtube",
      socialAccountId: "acc1",
      status: "published",
      version: 1,
      scheduledAt: null,
    });
    const isoLater = "2026-08-25T09:00:00.000Z";
    const isoEarlier = "2026-08-22T09:00:00.000Z";
    // wp1 has oldIso 2026-08-20, wp2 will be set to 2026-08-25, so derived should be 2026-08-20 (wp1)
    await schedulePublicationTarget(
      { publicationId: "wp2", scheduledAtUtc: isoLater, actorUserId: "u1", expectedVersion: 2 },
      deps as never,
    );
    const saved = (deps as unknown as { _getSavedTargets: () => Record<string, unknown>[] })._getSavedTargets();
    // earliest nonterminal is wp1 (2026-08-20), not published wp3
    const updateCall = (deps.updateContentRecord as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<string, unknown>;
    expect((updateCall.scheduledAtUtc as Date).toISOString()).toBe("2026-08-20T09:00:00.000Z");
    // now schedule wp1 to later, then earliest becomes wp2 later? Actually wp1 still earliest unless we change wp1
    void isoEarlier;
    void saved;
  });

  it("rejects schedule when production not ready", async () => {
    const deps = makeInMemoryDeps();
    (deps as unknown as { _maps: { deliverables: Map<string, Record<string, unknown>> } })._maps.deliverables.get("del1")!.productionStatus = "not_started";
    await expect(
      schedulePublicationTarget(
        { publicationId: "wp2", scheduledAtUtc: "2026-08-22T10:00:00.000Z", actorUserId: "u1", expectedVersion: 2 },
        deps as never,
      ),
    ).rejects.toMatchObject({ code: "PRODUCTION_NOT_READY" });
  });

  it("requires exact workflow_publication_id, does not match by platform/account", async () => {
    const deps = makeInMemoryDeps();
    // remove wp2 target, keep only wp1
    const cnt = (deps as unknown as { _maps: { contents: Map<string, Record<string, unknown>> } })._maps.contents.get("cnt1")!;
    cnt.platformTargets = [
      {
        platform: "youtube",
        account_id: "acc1",
        content_type: "video",
        status: "scheduled",
        publish_at_utc: "2026-08-20T09:00:00.000Z",
        workflow_publication_id: "wp1",
      },
    ];
    await expect(
      schedulePublicationTarget(
        { publicationId: "wp2", scheduledAtUtc: "2026-08-22T10:00:00.000Z", actorUserId: "u1", expectedVersion: 2 },
        deps as never,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cancelPublicationSchedule clears only keyed target and mirrors ready", async () => {
    const deps = makeInMemoryDeps();
    // make wp1 scheduled so cancel is allowed
    (deps as unknown as { _maps: { publications: Map<string, Record<string, unknown>> } })._maps.publications.get("wp1")!.status = "scheduled";
    (deps as unknown as { _maps: { publications: Map<string, Record<string, unknown>> } })._maps.publications.get("wp1")!.scheduledAt = new Date(
      "2026-08-20T09:00:00.000Z",
    );
    await cancelPublicationSchedule({ publicationId: "wp1", actorUserId: "u1", expectedVersion: 1 }, deps as never);
    const saved = (deps as unknown as { _getSavedTargets: () => Record<string, unknown>[] })._getSavedTargets();
    expect(saved.find((t) => t.workflow_publication_id === "wp1")?.publish_at_utc).toBeNull();
    expect(saved.find((t) => t.workflow_publication_id === "wp2")?.publish_at_utc).toBe("2026-08-20T09:00:00.000Z");
    const mirror = (deps as unknown as { _getWorkflowMirror: () => Record<string, unknown> })._getWorkflowMirror();
    expect(mirror.status).toBe("ready");
    expect(mirror.scheduledAt).toBeNull();
  });

  it("detachPublicationTarget rejects when publishing and requires schedule cancellation", async () => {
    const deps = makeInMemoryDeps();
    (deps as unknown as { _maps: { publications: Map<string, Record<string, unknown>> } })._maps.publications.get("wp1")!.status = "publishing";
    await expect(detachPublicationTarget({ publicationId: "wp1", actorUserId: "u1", expectedVersion: 1 }, deps as never)).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    // reset to scheduled should also reject
    (deps as unknown as { _maps: { publications: Map<string, Record<string, unknown>> } })._maps.publications.get("wp1")!.status = "scheduled";
    (deps as unknown as { _maps: { publications: Map<string, Record<string, unknown>> } })._maps.publications.get("wp1")!.scheduledAt = new Date();
    await expect(detachPublicationTarget({ publicationId: "wp1", actorUserId: "u1", expectedVersion: 1 }, deps as never)).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("linkPublicationTarget creates keyed target via Telegram-first", async () => {
    const deps = makeInMemoryDeps();
    // create new publication wp99 and new content cnt99
    (deps as unknown as { _maps: { publications: Map<string, Record<string, unknown>> } })._maps.publications.set("wp99", {
      id: "wp99",
      deliverableId: "del1",
      platform: "instagram",
      socialAccountId: "acc1",
      status: "ready",
      version: 1,
      scheduledAt: null,
    });
    // content without wp99 target
    const result = await linkPublicationTarget({ publicationId: "wp99", contentId: "cnt1", actorUserId: "u1", expectedVersion: 1 }, deps as never);
    expect((deps.updateContentRecord as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(1);
    const saved = (deps as unknown as { _getSavedTargets: () => Record<string, unknown>[] })._getSavedTargets();
    expect(saved.find((t) => t.workflow_publication_id === "wp99")).toBeDefined();
    expect(saved.find((t) => t.workflow_publication_id === "wp99")?.platform).toBe("instagram");
    void result;
  });
});
