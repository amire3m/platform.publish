import { describe, it, expect, vi } from "vitest";
import { mapTargetState, WorkflowTargetAdapter, reflectTargetState } from "./target-adapter";

describe("mapTargetState", () => {
  it("stays waiting_for_production when production not ready", () => {
    expect(mapTargetState({ targetStatus: "failed", productionStatus: "in_progress", terminalOwner: null })).toBe("waiting_for_production");
    expect(mapTargetState({ targetStatus: "published", productionStatus: "not_started", terminalOwner: null })).toBe("waiting_for_production");
    expect(mapTargetState({ targetStatus: "scheduled", productionStatus: "ready_for_review", terminalOwner: null })).toBe("waiting_for_production");
  });

  it("maps draft/approved to ready when production ready", () => {
    expect(mapTargetState({ targetStatus: "draft", productionStatus: "ready", terminalOwner: null })).toBe("ready");
    expect(mapTargetState({ targetStatus: "approved", productionStatus: "ready", terminalOwner: null })).toBe("ready");
  });

  it("maps scheduled, publishing, published, failed, cancelled correctly", () => {
    expect(mapTargetState({ targetStatus: "scheduled", productionStatus: "ready", terminalOwner: null })).toBe("scheduled");
    expect(mapTargetState({ targetStatus: "publishing", productionStatus: "ready", terminalOwner: null })).toBe("publishing");
    expect(mapTargetState({ targetStatus: "published", productionStatus: "ready", terminalOwner: null })).toBe("published");
    expect(mapTargetState({ targetStatus: "failed", productionStatus: "ready", terminalOwner: null })).toBe("failed");
    expect(mapTargetState({ targetStatus: "cancelled", productionStatus: "ready", terminalOwner: null })).toBe("do_not_publish");
  });

  it("returns published for manual terminal owner without overwriting", () => {
    expect(mapTargetState({ targetStatus: "published", productionStatus: "ready", terminalOwner: "manual" })).toBe("published");
  });
});

describe("WorkflowTargetAdapter terminal protection", () => {
  it("never overwrites terminal owner manual/imported; records safe no-op", async () => {
    const pub = { id: "wp1", status: "published", version: 3, terminalOwner: "manual", externalId: "ext1" };
    const deps = {
      getPublication: vi.fn(async () => pub),
      transactUpdatePublication: vi.fn(async () => { throw new Error("should not be called"); }),
      createEvent: vi.fn(async () => {}),
    };
    const adapter = new WorkflowTargetAdapter(deps as never);
    const result = await adapter.updatePublication("wp1", 3, { status: "published", terminalOwner: "automatic" });
    expect(deps.transactUpdatePublication).not.toHaveBeenCalledWith(expect.objectContaining({ terminalOwner: "automatic" }));
    expect(deps.transactUpdatePublication).not.toHaveBeenCalled();
    expect(deps.createEvent).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("reflectTargetState does not overwrite manual/imported", async () => {
    const pub = { id: "wp1", status: "published", version: 2, terminalOwner: "imported" };
    const deps = {
      getPublication: vi.fn(async () => pub),
      transactUpdatePublication: vi.fn(async () => pub),
      createEvent: vi.fn(async () => {}),
    };
    const target = { platform: "youtube", account_id: "a1", status: "published", external_id: "newExt", permalink: "http://x", workflow_publication_id: "wp1" } as never;
    const result = await reflectTargetState({ publicationId: "wp1", target, productionStatus: "ready" }, deps as never);
    expect(deps.transactUpdatePublication).not.toHaveBeenCalled();
    expect(deps.createEvent).toHaveBeenCalled();
    expect(result).toEqual(pub);
  });

  it("idempotently updates only when status differs", async () => {
    const pub = { id: "wp2", status: "scheduled", version: 1, terminalOwner: null, scheduledAt: new Date("2026-08-22T10:00:00.000Z") };
    const deps = {
      getPublication: vi.fn(async () => pub),
      transactUpdatePublication: vi.fn(async (_id, _ver, patch) => ({ ...pub, ...patch, version: 2 })),
      createEvent: vi.fn(async () => {}),
    };
    const target = { platform: "youtube", account_id: "a1", status: "scheduled", publish_at_utc: "2026-08-22T10:00:00.000Z", workflow_publication_id: "wp2" } as never;
    const result = await reflectTargetState({ publicationId: "wp2", target, productionStatus: "ready" }, deps as never);
    // Already scheduled with same time, should be no-op
    expect(deps.transactUpdatePublication).not.toHaveBeenCalled();
    expect(result).toEqual(pub);
  });
});
