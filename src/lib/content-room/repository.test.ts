import { describe, expect, it, beforeEach } from "vitest";
import {
  createContentRoomRepository,
  InMemoryContentRoomPort,
  ContentRoomRepositoryError,
  PRODUCT_TYPES,
  CHANNELS,
  CONTENT_STATUSES,
} from "./repository";

describe("content room repository", () => {
  it("creates product with N parts rows", async () => {
    const port = new InMemoryContentRoomPort();
    const repo = createContentRoomRepository(port);
    const result = await repo.createProduct({
      title: "سریال تست",
      productType: "serial",
      channel: "zed_revayat",
      partsCount: 3,
      actorUserId: "u1",
    });
    expect(result.parts).toHaveLength(3);
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    expect(port.products).toHaveLength(1);
    expect(port.parts).toHaveLength(3);
    expect(port.events).toMatchObject([{ entityType: "content_product", action: "created" }]);
    expect(result.status).toBe("imported");
    expect(result.version).toBe(1);
  });

  it("listProducts filters by search, type, channel, status", async () => {
    const port = new InMemoryContentRoomPort();
    const repo = createContentRoomRepository(port);
    await repo.createProduct({ title: "فرات ۳۱", productType: "serial", channel: "zed_revayat", partsCount: 2, actorUserId: "u1" });
    await repo.createProduct({ title: "مستند طبیعت", productType: "documentary", channel: "tamashin", partsCount: 1, actorUserId: "u1" });
    // Manually set second product status to editing_youtube via transition? Use in-memory direct for setup
    // Instead test filters on creation: search
    const search = await repo.listProducts({ search: "فرات" });
    expect(search).toHaveLength(1);
    expect(search[0].title).toBe("فرات ۳۱");
    const byType = await repo.listProducts({ productType: "documentary" });
    expect(byType).toHaveLength(1);
    const byChannel = await repo.listProducts({ channel: "tamashin" });
    expect(byChannel).toHaveLength(1);
    const byStatus = await repo.listProducts({ status: "imported" });
    expect(byStatus).toHaveLength(2);
  });

  it("getProduct returns detail with parts", async () => {
    const port = new InMemoryContentRoomPort();
    const repo = createContentRoomRepository(port);
    const created = await repo.createProduct({ title: "فیلم کوتاه", productType: "short_film", channel: "shock", partsCount: 2, actorUserId: "u1" });
    const detail = await repo.getProduct(created.id);
    expect(detail).not.toBeNull();
    expect(detail?.parts).toHaveLength(2);
    expect(await repo.getProduct("missing")).toBeNull();
  });

  it("rejects version conflict on status update without event", async () => {
    const port = new InMemoryContentRoomPort();
    const repo = createContentRoomRepository(port);
    const created = await repo.createProduct({ title: "محصول نسخه", productType: "film", channel: "tinazh", partsCount: 1, actorUserId: "u1" });
    // first valid transition
    const v2 = await repo.updateProductStatus({
      id: created.id,
      status: "editing_youtube",
      expectedVersion: 1,
      actorUserId: "u1",
    });
    expect(v2.version).toBe(2);
    expect(v2.status).toBe("editing_youtube");
    const eventsBefore = port.events.length;
    await expect(
      repo.updateProductStatus({ id: created.id, status: "copyright_fix", expectedVersion: 1, actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(port.events).toHaveLength(eventsBefore);
    const still = await port.getProduct(created.id);
    expect(still?.version).toBe(2);
  });

  it("validates forward sequential without reason and requires reason for backward/skip", async () => {
    const port = new InMemoryContentRoomPort();
    const repo = createContentRoomRepository(port);
    const created = await repo.createProduct({ title: "تست وضعیت", productType: "educational", channel: "zaviye_no", partsCount: 1, actorUserId: "u1" });

    // imported -> editing_youtube : forward sequential, no reason required -> should succeed
    const s1 = await repo.updateProductStatus({ id: created.id, status: "editing_youtube", expectedVersion: 1, actorUserId: "u1" });
    expect(s1.status).toBe("editing_youtube");

    // editing_youtube -> copyright_fix : forward sequential
    const s2 = await repo.updateProductStatus({ id: s1.id, status: "copyright_fix", expectedVersion: 2, actorUserId: "u1" });
    expect(s2.status).toBe("copyright_fix");

    // copyright_fix -> highlight_done : forward sequential
    const s3 = await repo.updateProductStatus({ id: s2.id, status: "highlight_done", expectedVersion: 3, actorUserId: "u1" });
    expect(s3.status).toBe("highlight_done");

    // highlight_done -> reel_done : forward sequential
    const s4 = await repo.updateProductStatus({ id: s3.id, status: "reel_done", expectedVersion: 4, actorUserId: "u1" });
    expect(s4.status).toBe("reel_done");

    // reel_done -> cover_ready
    const s5 = await repo.updateProductStatus({ id: s4.id, status: "cover_ready", expectedVersion: 5, actorUserId: "u1" });
    expect(s5.status).toBe("cover_ready");

    // cover_ready -> ready_to_send
    const s6 = await repo.updateProductStatus({ id: s5.id, status: "ready_to_send", expectedVersion: 6, actorUserId: "u1" });
    expect(s6.status).toBe("ready_to_send");

    // Now test backward requires reason: try to go back to imported without reason should fail
    const eventsBefore = port.events.length;
    await expect(
      repo.updateProductStatus({ id: s6.id, status: "imported", expectedVersion: 7, actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    expect(port.events).toHaveLength(eventsBefore);

    // with reason should succeed
    const back = await repo.updateProductStatus({
      id: s6.id,
      status: "imported",
      expectedVersion: 7,
      actorUserId: "u1",
      reason: "بازگشت برای اصلاح",
    });
    expect(back.status).toBe("imported");
    expect(back.version).toBe(8);

    // skip forward requires reason: imported -> copyright_fix (skip editing_youtube) without reason should fail
    await expect(
      repo.updateProductStatus({ id: back.id, status: "copyright_fix", expectedVersion: 8, actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    // with reason succeeds
    const skip = await repo.updateProductStatus({
      id: back.id,
      status: "copyright_fix",
      expectedVersion: 8,
      actorUserId: "u1",
      reason: "پرش با دلیل",
    });
    expect(skip.status).toBe("copyright_fix");
  });

  it("rejects invalid status and same status", async () => {
    const port = new InMemoryContentRoomPort();
    const repo = createContentRoomRepository(port);
    const created = await repo.createProduct({ title: "اعتبارسنجی", productType: "serial", channel: "zed_revayat", partsCount: 1, actorUserId: "u1" });
    await expect(
      repo.updateProductStatus({ id: created.id, status: "invalid_status" as never, expectedVersion: 1, actorUserId: "u1", reason: "دلیل" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      repo.updateProductStatus({ id: created.id, status: "imported", expectedVersion: 1, actorUserId: "u1", reason: "دلیل" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("validates createProduct inputs", async () => {
    const port = new InMemoryContentRoomPort();
    const repo = createContentRoomRepository(port);
    await expect(
      repo.createProduct({ title: "", productType: "serial", channel: "zed_revayat", partsCount: 1, actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      repo.createProduct({ title: "x".repeat(201), productType: "serial", channel: "zed_revayat", partsCount: 1, actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      repo.createProduct({ title: "ok", productType: "invalid_type", channel: "zed_revayat", partsCount: 1, actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      repo.createProduct({ title: "ok", productType: "serial", channel: "invalid_channel", partsCount: 1, actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      repo.createProduct({ title: "ok", productType: "serial", channel: "zed_revayat", partsCount: 0, actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("throws NOT_FOUND for missing product on update", async () => {
    const port = new InMemoryContentRoomPort();
    const repo = createContentRoomRepository(port);
    await expect(
      repo.updateProductStatus({ id: "CPR-missing", status: "editing_youtube", expectedVersion: 1, actorUserId: "u1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
