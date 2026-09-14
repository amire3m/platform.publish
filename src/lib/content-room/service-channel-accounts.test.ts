import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/channel-accounts", () => ({
  resolveChannelAccountIdDb: vi.fn().mockResolvedValue("acc-9"),
}));

import { createContentRoomRepository, InMemoryContentRoomPort } from "./repository";
import { createContentRoomService } from "./service";
import { InMemoryWorkflowPort } from "@/lib/workflow/repository";
import { resolveChannelAccountIdDb } from "@/lib/channel-accounts";

describe("send uses persisted channel linkage", () => {
  it("stamps publications with the linked social account", async () => {
    const contentPort = new InMemoryContentRoomPort();
    const contentRepo = createContentRoomRepository(contentPort);
    const workflowPort = new InMemoryWorkflowPort();
    const service = createContentRoomService({ contentPort, workflowPort });
    const product = await contentRepo.createProduct({ title: "t", productType: "serial", channel: "zed_revayat", partsCount: 1, actorUserId: "u1" });
    const statuses = ["editing_youtube", "copyright_fix", "highlight_done", "reel_done", "cover_ready", "ready_to_send"] as const;
    let version = 1;
    for (const s of statuses) {
      await contentRepo.updateProductStatus({ id: product.id, status: s, expectedVersion: version, actorUserId: "u1" });
      version++;
    }
    const result = await service.sendToPublication({ productId: product.id, expectedVersion: version, actorUserId: "u1" });
    expect(resolveChannelAccountIdDb).toHaveBeenCalled();
    expect(result.publications.length).toBeGreaterThan(0);
    for (const p of result.publications) {
      expect(p.socialAccountId).toBe("acc-9");
    }
  });
});
