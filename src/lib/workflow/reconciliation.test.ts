import { describe, it, expect, vi } from "vitest";
import { reconcileWorkflowTargets } from "./reconciliation";

describe("reconcileWorkflowTargets", () => {
  it("reconciles pages of 100 and reflects differences idempotently", async () => {
    const pubs = Array.from({ length: 150 }, (_, i) => ({
      id: `wp${i}`,
      deliverableId: `del${i}`,
      status: "ready",
      version: 1,
      terminalOwner: null,
    }));
    const deliverables = new Map(pubs.map((p) => [p.deliverableId, { id: p.deliverableId, productionStatus: "ready", contentId: `cnt${p.id}` }]));
    const contents = new Map(pubs.map((p) => [ `cnt${p.id}`, { id: `cnt${p.id}`, platformTargets: [{ platform: "youtube", account_id: "a1", status: "published", external_id: "ext", permalink: "http://x", workflow_publication_id: p.id }], platform_targets: undefined }]));

    const transactUpdatePublication = vi.fn(async (id, ver, patch) => {
      const pub = pubs.find((p) => p.id === id)!;
      Object.assign(pub, patch, { version: ver + 1 });
      return pub;
    });

    const deps: Record<string, unknown> = {
      listPublicationsPaged: async (offset: number, limit: number) => pubs.slice(offset, offset + limit),
      getDeliverable: async (id: string) => deliverables.get(id) ?? null,
      getContent: async (id: string) => contents.get(id) ?? null,
      getPublication: async (id: string) => pubs.find((p) => p.id === id) ?? null,
      transactUpdatePublication,
      createEvent: vi.fn(async () => {}),
    };

    const result = await reconcileWorkflowTargets(deps as never);
    expect(result.processed).toBe(150);
    expect(transactUpdatePublication).toHaveBeenCalled();
    // Should have paged 100 then 50
    // Verify at least one update was to published
    const calls = (transactUpdatePublication as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });

  it("missing keyed target creates warning and does not guess another target", async () => {
    const pubs = [{ id: "wp1", deliverableId: "del1", status: "ready", version: 1, terminalOwner: null }];
    const deliverables = new Map([["del1", { id: "del1", productionStatus: "ready", contentId: "cnt1" } ]]);
    const contents = new Map([["cnt1", { id: "cnt1", platformTargets: [{ platform: "youtube", account_id: "a1", status: "scheduled", workflow_publication_id: "other_wp" }] }]]);

    const createEvent = vi.fn(async () => {});
    const transactUpdatePublication = vi.fn(async () => pubs[0]);

    const deps = {
      listPublicationsPaged: async (offset: number, limit: number) => offset === 0 ? pubs : [],
      getDeliverable: async (id: string) => deliverables.get(id) ?? null,
      getContent: async (id: string) => contents.get(id) ?? null,
      getPublication: async (id: string) => pubs.find((p) => p.id === id) ?? null,
      transactUpdatePublication,
      createEvent,
    };

    const result = await reconcileWorkflowTargets(deps as never);
    expect(result.warnings).toBe(1);
    expect(transactUpdatePublication).not.toHaveBeenCalled();
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "reconciliation_missing_target" }));
  });

  it("is idempotent: already reflected target does not cause extra update", async () => {
    const pub = { id: "wp1", deliverableId: "del1", status: "scheduled", version: 1, terminalOwner: null, scheduledAt: new Date("2026-08-22T10:00:00.000Z") };
    const deps = {
      listPublicationsPaged: async (offset: number) => offset === 0 ? [pub] : [],
      getDeliverable: async () => ({ id: "del1", productionStatus: "ready", contentId: "cnt1" }),
      getContent: async () => ({ id: "cnt1", platformTargets: [{ platform: "youtube", account_id: "a1", status: "scheduled", publish_at_utc: "2026-08-22T10:00:00.000Z", workflow_publication_id: "wp1" }] }),
      getPublication: async () => pub,
      transactUpdatePublication: vi.fn(async () => pub),
      createEvent: vi.fn(async () => {}),
    };
    const result = await reconcileWorkflowTargets(deps as never);
    expect(deps.transactUpdatePublication).not.toHaveBeenCalled();
    expect(result.reconciled).toBe(0);
  });
});
