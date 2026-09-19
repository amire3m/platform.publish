import { describe, expect, it } from "vitest";

import { runBigJob } from "./big-job";
import { cleanupPayload, payloadSize, type MediaPayload } from "./payload";

describe("runBigJob", () => {
  it("serializes concurrent jobs instead of running them together", async () => {
    const order: string[] = [];
    const slow = (name: string, ms: number) =>
      runBigJob(name, async () => {
        order.push(`start:${name}`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`end:${name}`);
        return name;
      });
    const [a, b] = await Promise.all([slow("a", 30), slow("b", 10)]);
    expect([a, b]).toEqual(["a", "b"]);
    expect(order).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });

  it("releases the mutex even when the job throws", async () => {
    await expect(runBigJob("boom", async () => { throw new Error("x"); })).rejects.toThrow("x");
    const out = await runBigJob("after", async () => "ok");
    expect(out).toBe("ok");
  });
});

describe("payload helpers", () => {
  it("measures buffer and file payloads", () => {
    const buf: MediaPayload = { kind: "buffer", buffer: Buffer.from("abc") };
    const file: MediaPayload = { kind: "file", path: "/tmp/x", size: 99, cleanup: async () => {} };
    expect(payloadSize(buf)).toBe(3);
    expect(payloadSize(file)).toBe(99);
  });

  it("cleanup only touches file payloads", async () => {
    let cleaned = 0;
    await cleanupPayload({ kind: "buffer", buffer: Buffer.from("x") });
    await cleanupPayload({ kind: "file", path: "/tmp/x", size: 1, cleanup: async () => { cleaned++; } });
    expect(cleaned).toBe(1);
  });
});
