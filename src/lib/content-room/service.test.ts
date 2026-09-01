import { describe, expect, it } from "vitest";
import { createContentRoomRepository, InMemoryContentRoomPort } from "./repository";
import { createContentRoomService } from "./service";
import { InMemoryWorkflowPort } from "@/lib/workflow/repository";

function createReadyProduct(port: InMemoryContentRoomPort, repo: ReturnType<typeof createContentRoomRepository>, partsCount = 2) {
  return repo.createProduct({ title: "محصول آماده", productType: "serial", channel: "zed_revayat", partsCount, actorUserId: "u1" });
}

async function advanceToReady(port: InMemoryContentRoomPort, repo: ReturnType<typeof createContentRoomRepository>, productId: string) {
  const statuses = ["editing_youtube", "copyright_fix", "highlight_done", "reel_done", "cover_ready", "ready_to_send"] as const;
  let version = 1;
  for (const s of statuses) {
    await repo.updateProductStatus({ id: productId, status: s, expectedVersion: version, actorUserId: "u1" });
    version++;
  }
  return version; // next expected version
}

describe("content room sendToPublication service", () => {
  it("throws if product not ready_to_send", async () => {
    const contentPort = new InMemoryContentRoomPort();
    const contentRepo = createContentRoomRepository(contentPort);
    const workflowPort = new InMemoryWorkflowPort();
    const service = createContentRoomService({ contentPort, workflowPort });
    const product = await createReadyProduct(contentPort, contentRepo, 1);
    // product is imported, not ready
    await expect(service.sendToPublication({ productId: product.id, expectedVersion: 1, actorUserId: "u1" })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect(workflowPort.programs).toHaveLength(0);
  });

  it("throws VERSION_CONFLICT on stale version", async () => {
    const contentPort = new InMemoryContentRoomPort();
    const contentRepo = createContentRoomRepository(contentPort);
    const workflowPort = new InMemoryWorkflowPort();
    const service = createContentRoomService({ contentPort, workflowPort });
    const product = await createReadyProduct(contentPort, contentRepo, 1);
    await advanceToReady(contentPort, contentRepo, product.id);
    // product now version 7 ready_to_send
    await expect(service.sendToPublication({ productId: product.id, expectedVersion: 1, actorUserId: "u1" })).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(workflowPort.programs).toHaveLength(0);
  });

  it("throws NOT_FOUND for missing product", async () => {
    const contentPort = new InMemoryContentRoomPort();
    const workflowPort = new InMemoryWorkflowPort();
    const service = createContentRoomService({ contentPort, workflowPort });
    await expect(service.sendToPublication({ productId: "CPR-missing", expectedVersion: 1, actorUserId: "u1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("creates 4*N deliverables and logs program on success", async () => {
    const contentPort = new InMemoryContentRoomPort();
    const contentRepo = createContentRoomRepository(contentPort);
    const workflowPort = new InMemoryWorkflowPort();
    const service = createContentRoomService({ contentPort, workflowPort });

    const partsCount = 3;
    const product = await createReadyProduct(contentPort, contentRepo, partsCount);
    const nextVersion = await advanceToReady(contentPort, contentRepo, product.id);
    // nextVersion should be 7, product version is 7
    const fetched = await contentPort.getProduct(product.id);
    expect(fetched?.status).toBe("ready_to_send");
    expect(fetched?.version).toBe(7);

    const result = await service.sendToPublication({ productId: product.id, expectedVersion: 7, actorUserId: "u1" });

    // product version bumped
    expect(result.product.version).toBe(8);
    const after = await contentPort.getProduct(product.id);
    expect(after?.version).toBe(8);
    // event logged
    expect(contentPort.events.some((e) => e.action === "sent_to_publication" && e.entityId === product.id)).toBe(true);

    // workflow program created
    expect(workflowPort.programs).toHaveLength(1);
    expect(result.program.title).toBe(product.title);
    expect(result.program.source).toBe("content_room");
    expect(result.program.sourceRef).toBe(product.id);

    // 4*N deliverables
    expect(result.deliverables).toHaveLength(4 * partsCount);
    expect(workflowPort.deliverables).toHaveLength(4 * partsCount);

    // kinds distribution
    const kinds = result.deliverables.map((d) => d.kind);
    expect(kinds.filter((k) => k === "youtube_full")).toHaveLength(partsCount);
    expect(kinds.filter((k) => k === "highlight")).toHaveLength(partsCount);
    expect(kinds.filter((k) => k === "reel")).toHaveLength(partsCount);
    expect(kinds.filter((k) => k === "cover")).toHaveLength(partsCount);

    // sortOrder sequential
    const orders = result.deliverables.map((d) => d.sortOrder);
    expect(orders).toEqual([...Array(4 * partsCount).keys()]);

    // publications: 1 per deliverable (mapped via channel -> social account)
    expect(result.publications).toHaveLength(4 * partsCount);
    expect(workflowPort.publications).toHaveLength(4 * partsCount);
    // each deliverable should have 1 publication with correct platform mapping
    const kindToPlatform: Record<string, string> = {
      youtube_full: "youtube",
      highlight: "youtube",
      reel: "instagram",
      cover: "instagram",
    };
    for (const d of result.deliverables) {
      const pubs = result.publications.filter((p) => p.deliverableId === d.id);
      expect(pubs).toHaveLength(1);
      const expected = kindToPlatform[d.kind ?? ""] ?? "youtube";
      expect(pubs[0].platform).toBe(expected);
      // socialAccountId fallback null when channel not linked
      expect(pubs[0].socialAccountId).toBeNull();
    }

    // cover deliverable is image type? check kind cover exists
    const covers = result.deliverables.filter((d) => d.kind === "cover");
    expect(covers.length).toBe(partsCount);
  });

  it("creates correct deliverables for single part", async () => {
    const contentPort = new InMemoryContentRoomPort();
    const contentRepo = createContentRoomRepository(contentPort);
    const workflowPort = new InMemoryWorkflowPort();
    const service = createContentRoomService({ contentPort, workflowPort });

    const product = await createReadyProduct(contentPort, contentRepo, 1);
    await advanceToReady(contentPort, contentRepo, product.id);
    const result = await service.sendToPublication({ productId: product.id, expectedVersion: 7, actorUserId: "u1" });
    expect(result.deliverables).toHaveLength(4);
    expect(result.publications).toHaveLength(4);
  });

  it("version conflict leaves no partial workflow on second send attempt", async () => {
    const contentPort = new InMemoryContentRoomPort();
    const contentRepo = createContentRoomRepository(contentPort);
    const workflowPort = new InMemoryWorkflowPort();
    const service = createContentRoomService({ contentPort, workflowPort });

    const product = await createReadyProduct(contentPort, contentRepo, 2);
    await advanceToReady(contentPort, contentRepo, product.id);
    await service.sendToPublication({ productId: product.id, expectedVersion: 7, actorUserId: "u1" });
    expect(workflowPort.programs).toHaveLength(1);
    // second attempt with stale version should fail without creating another program
    await expect(service.sendToPublication({ productId: product.id, expectedVersion: 7, actorUserId: "u1" })).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(workflowPort.programs).toHaveLength(1);
    expect(workflowPort.deliverables).toHaveLength(8);
  });

  it("maps part files onto deliverables by kind", async () => {
    const contentPort = new InMemoryContentRoomPort();
    const contentRepo = createContentRoomRepository(contentPort);
    const workflowPort = new InMemoryWorkflowPort();
    const service = createContentRoomService({ contentPort, workflowPort });

    const product = await createReadyProduct(contentPort, contentRepo, 1);
    // set part files directly on the in-memory port
    const part = contentPort.parts.find((p) => p.productId === product.id)!;
    part.fileRef = "tg_raw_file_1";
    part.coverFileRef = "tg_cover_file_1";
    part.highlightFileRef = "tg_highlight_file_1";
    part.reelFileRef = "tg_reel_file_1";

    await advanceToReady(contentPort, contentRepo, product.id);
    const result = await service.sendToPublication({ productId: product.id, expectedVersion: 7, actorUserId: "u1" });

    const byKind = Object.fromEntries(result.deliverables.map((d) => [d.kind, d.fileRef]));
    expect(byKind.youtube_full).toBe("tg_raw_file_1");
    expect(byKind.cover).toBe("tg_cover_file_1");
    expect(byKind.highlight).toBe("tg_highlight_file_1");
    expect(byKind.reel).toBe("tg_reel_file_1");
  });
});
