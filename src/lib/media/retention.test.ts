import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync, statSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { shouldKeep, sweepMediaCache, runMediaSweep, touchMediaAccess } from "./retention";

describe("shouldKeep", () => {
  const now = new Date("2026-09-15T12:00:00Z").getTime();
  it("always keeps thumbnails", () => {
    expect(shouldKeep("/v/thumbnails/a.jpg", new Date("2020-01-01"), now, 7)).toBe(true);
  });
  it("keeps recently accessed videos", () => {
    expect(shouldKeep("/v/documents/f.mp4", new Date("2026-09-10T12:00:00Z"), now, 7)).toBe(true);
  });
  it("drops videos untouched past TTL", () => {
    expect(shouldKeep("/v/documents/f.mp4", new Date("2026-09-01T12:00:00Z"), now, 7)).toBe(false);
  });
  it("drops videos never recorded", () => {
    expect(shouldKeep("/v/documents/f.mp4", null, now, 7)).toBe(false);
  });
});

describe("sweepMediaCache", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sweep-"));
    mkdirSync(join(dir, "documents"), { recursive: true });
    mkdirSync(join(dir, "thumbnails"), { recursive: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes only stale videos and reports bytes", async () => {
    const oldVideo = join(dir, "documents", "old.mp4");
    const freshVideo = join(dir, "documents", "new.mp4");
    const thumb = join(dir, "thumbnails", "t.jpg");
    writeFileSync(oldVideo, "0123456789");
    writeFileSync(freshVideo, "0123456789");
    writeFileSync(thumb, "0123456789");
    const old = new Date("2026-09-01T12:00:00Z");
    utimesSync(oldVideo, old, old);
    const access = new Map<string, Date>([[oldVideo, new Date("2026-09-01T12:00:00Z")], [freshVideo, new Date("2026-09-14T12:00:00Z")]]);
    const out = await sweepMediaCache({
      root: dir,
      now: new Date("2026-09-15T12:00:00Z").getTime(),
      ttlDays: 7,
      dryRun: false,
      getLastAccess: async (p) => access.get(p) ?? null,
    });
    expect(existsSync(oldVideo)).toBe(false);
    expect(existsSync(freshVideo)).toBe(true);
    expect(existsSync(thumb)).toBe(true);
    expect(out).toEqual({ scanned: 3, deleted: 1, freedBytes: 10, errors: 0 });
  });

  it("dry run deletes nothing", async () => {
    const oldVideo = join(dir, "documents", "old.mp4");
    writeFileSync(oldVideo, "0123456789");
    const out = await sweepMediaCache({
      root: dir,
      now: new Date("2026-09-15T12:00:00Z").getTime(),
      ttlDays: 7,
      dryRun: true,
      getLastAccess: async () => new Date("2026-09-01T12:00:00Z"),
    });
    expect(existsSync(oldVideo)).toBe(true);
    expect(out.deleted).toBe(1);
    expect(out.freedBytes).toBe(10);
  });

  it("treats a missing root as empty without throwing", async () => {
    const out = await sweepMediaCache({
      root: join(dir, "nope"),
      now: Date.now(),
      ttlDays: 7,
      dryRun: false,
      getLastAccess: async () => null,
    });
    expect(out).toEqual({ scanned: 0, deleted: 0, freedBytes: 0, errors: 0 });
  });

  it("falls back to filesystem times when nothing is recorded", async () => {
    const f = join(dir, "documents", "x.mp4");
    writeFileSync(f, "0123456789");
    const ancient = new Date("2020-01-01T00:00:00Z");
    utimesSync(f, ancient, ancient);
    const seen: string[] = [];
    await sweepMediaCache({
      root: dir,
      now: new Date("2026-09-15T12:00:00Z").getTime(),
      ttlDays: 7,
      dryRun: false,
      getLastAccess: async (p) => {
        seen.push(p);
        return null;
      },
    });
    // no DB record → falls back to max(atime, mtime) = ancient → deleted
    expect(seen).toContain(f);
    expect(existsSync(f)).toBe(false);
  });

  it("keeps unrecorded files touched recently on disk", async () => {
    const f = join(dir, "documents", "y.mp4");
    writeFileSync(f, "0123456789");
    const now = new Date("2026-09-15T12:00:00Z");
    utimesSync(f, now, now);
    await sweepMediaCache({
      root: dir,
      now: now.getTime(),
      ttlDays: 7,
      dryRun: false,
      getLastAccess: async () => null,
    });
    expect(existsSync(f)).toBe(true);
  });
});

describe("runMediaSweep", () => {
  it("sweeps a tmp root end to end (dry run deletes nothing)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "runsweep-"));
    mkdirSync(join(dir, "documents"), { recursive: true });
    const f = join(dir, "documents", "old.mp4");
    writeFileSync(f, "0123456789");
    const ancient = new Date("2020-01-01T00:00:00Z");
    utimesSync(f, ancient, ancient);
    const out = await runMediaSweep({ root: dir, ttlDays: 7, dryRun: true, highWaterPct: 101 });
    expect(existsSync(f)).toBe(true);
    expect(out.deleted).toBe(1);
    expect(out.ttlDays).toBe(7);
  });
});
