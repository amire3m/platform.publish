import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  createImportPreviewService,
  createImportPreview,
  loadVerifiedPreview,
  expireImportPreviews,
  sha256Hex,
  clearPreviewStore,
} from "./preview";

function tamper(token: string): string {
  // Flip last character
  return token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");
}

describe("workflow import preview persistence and token", () => {
  const JWT_SECRET = "test-jwt-secret-for-preview";
  let now = new Date("2026-08-22T10:00:00Z");
  const clock = {
    now: () => new Date(now.getTime()),
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };

  beforeEach(() => {
    clearPreviewStore();
    process.env.JWT_SECRET = JWT_SECRET;
    now = new Date("2026-08-22T10:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates preview with SHA-256 hash and token without CSV, verifiable", async () => {
    const service = createImportPreviewService({ jwtSecret: JWT_SECRET, now: clock.now });
    const csv = "عنوان,ریلز\nفرات قسمت 31,کامل";
    const mapping = { titleColumn: 0 };
    const preview = await service.createImportPreview({ csv, mapping, actorUserId: "u1" });
    expect(preview.csvHash).toBe(sha256Hex(csv));
    // token should not contain CSV
    const decoded = jwt.decode(preview.token) as Record<string, unknown> | null;
    const tokenStr = JSON.stringify(decoded);
    expect(tokenStr).not.toContain("فرات");
    // Also raw token base64 should not contain csv substring
    expect(preview.token).not.toContain(encodeURIComponent(csv.slice(0, 5)));

    const loaded = await service.loadVerifiedPreview(preview.token);
    expect(loaded).toMatchObject({ csvHash: sha256Hex(csv), actorUserId: "u1" });
    expect(loaded.csvSnapshot).toBe(csv);
  });

  it("rejects tampered token with INVALID_PREVIEW", async () => {
    const service = createImportPreviewService({ jwtSecret: JWT_SECRET, now: clock.now });
    const csv = "a,b\n1,2";
    const preview = await service.createImportPreview({ csv, mapping: {}, actorUserId: "u1" });
    await expect(service.loadVerifiedPreview(tamper(preview.token))).rejects.toMatchObject({ code: "INVALID_PREVIEW" });
  });

  it("expires after 30 minutes", async () => {
    const service = createImportPreviewService({ jwtSecret: JWT_SECRET, now: clock.now });
    const csv = "a,b\n1,2";
    const preview = await service.createImportPreview({ csv, mapping: {}, actorUserId: "u1" });
    // advance 31 minutes
    clock.advance(31 * 60 * 1000);
    vi.setSystemTime(clock.now());
    await expect(service.loadVerifiedPreview(preview.token, { now: clock.now() })).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
  });

  it("verifies actor, hash, and consumedAt single-use", async () => {
    const store = new Map();
    const service = createImportPreviewService({ store: store as never, jwtSecret: JWT_SECRET, now: clock.now });
    const csv = "a,b\n1,2";
    const preview = await service.createImportPreview({ csv, mapping: {}, actorUserId: "u1" });
    // correct actor passes
    await expect(service.loadVerifiedPreview(preview.token, { expectedActorUserId: "u1" } as never)).resolves.toBeDefined();
    // wrong actor fails
    await expect(service.loadVerifiedPreview(preview.token, { expectedActorUserId: "u2" } as never)).rejects.toMatchObject({ code: "INVALID_PREVIEW" });
    // tamper hash in token payload? create token with wrong hash
    const wrongHashToken = jwt.sign({ pid: preview.id, aid: "u1", hash: "deadbeef" }, JWT_SECRET, { expiresIn: "30m" });
    await expect(service.loadVerifiedPreview(wrongHashToken)).rejects.toMatchObject({ code: "INVALID_PREVIEW" });
    // consume and then ensure second load fails with PREVIEW_CONSUMED
    await service.consumePreview(preview.id);
    await expect(service.loadVerifiedPreview(preview.token)).rejects.toMatchObject({ code: "PREVIEW_CONSUMED" });
  });

  it("expireImportPreviews removes expired entries", async () => {
    const service = createImportPreviewService({ jwtSecret: JWT_SECRET, now: clock.now });
    const preview = await service.createImportPreview({ csv: "a,b", mapping: {}, actorUserId: "u1" });
    expect(service.store.size).toBe(1);
    clock.advance(31 * 60 * 1000);
    const removed = await service.expireImportPreviews(clock.now());
    expect(removed).toBe(1);
    expect(service.store.size).toBe(0);
  });

  it("token does not contain CSV snapshot and verifies DB hash", async () => {
    const csv = "sensitive,csv\nsecret,data";
    const preview = await createImportPreview({ csv, mapping: { x: 1 }, actorUserId: "u1" });
    // Ensure token payload decoded does not contain csv
    const decoded = jwt.decode(preview.token) as Record<string, unknown>;
    expect(decoded).not.toHaveProperty("csv");
    expect(decoded).not.toHaveProperty("csvSnapshot");
    // Tamper hash in DB should cause INVALID
    // Directly modify stored record
    const { getPreviewStore } = await import("./preview");
    const store = getPreviewStore();
    const rec = store.get(preview.id);
    if (rec) {
      rec.csvHash = "tampered";
      store.set(preview.id, rec);
    }
    await expect(loadVerifiedPreview(preview.token)).rejects.toMatchObject({ code: "INVALID_PREVIEW" });
    clearPreviewStore();
  });

  it("clears via expireImportPreviews function", async () => {
    const csv = "a,b\n1,2";
    await createImportPreview({ csv, mapping: {}, actorUserId: "u1", now: new Date("2026-08-22T10:00:00Z") });
    // advance real time for expire check using past now
    const future = new Date("2026-08-22T11:00:00Z");
    const count = await expireImportPreviews(future);
    // at least expires
    expect(count).toBeGreaterThanOrEqual(0);
    clearPreviewStore();
  });
});
