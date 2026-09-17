import { describe, expect, it } from "vitest";
import { filterMirrorsByStatus, summarizeMirrors } from "./status";

const rows = [
  { status: "ready" },
  { status: "ready" },
  { status: "queued" },
  { status: "uploading" },
  { status: "error" },
] as const;

describe("summarizeMirrors", () => {
  it("counts rows per status", () => {
    expect(summarizeMirrors(rows)).toEqual({ ready: 2, uploading: 1, queued: 1, error: 1 });
  });

  it("returns zeros for empty input", () => {
    expect(summarizeMirrors([])).toEqual({ ready: 0, uploading: 0, queued: 0, error: 0 });
  });
});

describe("filterMirrorsByStatus", () => {
  it("returns all rows without a filter", () => {
    expect(filterMirrorsByStatus(rows, "")).toHaveLength(5);
  });

  it("filters to the requested status", () => {
    expect(filterMirrorsByStatus(rows, "ready")).toHaveLength(2);
    expect(filterMirrorsByStatus(rows, "error")).toHaveLength(1);
  });
});
