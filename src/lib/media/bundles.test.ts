import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { isBundleRef, bundleIdOf, splitFileToParts, sha256File } from "./bundles";

describe("bundles", () => {
  it("detects bundle markers", () => {
    expect(isBundleRef("bundle:BDL-1")).toBe(true);
    expect(isBundleRef("BAACAgQAAx0")).toBe(false);
    expect(isBundleRef(null)).toBe(false);
    expect(bundleIdOf("bundle:BDL-1")).toBe("BDL-1");
  });

  it("splits and verifies integrity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "emro-btest-"));
    try {
      const src = join(dir, "src.bin");
      const data = Buffer.alloc(1024 * 1024 + 123, 0xab);
      await writeFile(src, data);
      const expected = createHash("sha256").update(data).digest("hex");
      const parts = await splitFileToParts(src, 256 * 1024, dir);
      expect(parts.length).toBe(5);
      // concat parts == original
      const { createReadStream } = await import("node:fs");
      const { pipeline } = await import("node:stream/promises");
      const { createWriteStream } = await import("node:fs");
      const out = join(dir, "out.bin");
      const ws = createWriteStream(out);
      for (const p of parts) {
        await pipeline(createReadStream(p), ws, { end: false } as never);
      }
      await new Promise<void>((resolve, reject) => {
        ws.on("finish", () => resolve());
        ws.on("error", reject);
        ws.end();
      });
      expect(await sha256File(out)).toBe(expected);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
