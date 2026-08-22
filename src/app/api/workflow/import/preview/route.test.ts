import { describe, it, expect, vi } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handlePreviewRequest } from "./route";

function deniedDeps() {
  return {
    requirePermission: vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") }),
    fetchSheetCsv: vi.fn(),
    parsePublicSheetUrl: vi.fn(),
    previewWorkflowImport: vi.fn(),
  } as unknown as Parameters<typeof handlePreviewRequest>[1];
}

function allowedDeps(overrides: Record<string, unknown> = {}) {
  const user = { id: "u1", role: "manager", allowedActions: ["import_workflow"] };
  const requirePermission = vi.fn().mockResolvedValue({ user, response: null });
  return {
    requirePermission,
    fetchSheetCsv: vi.fn().mockResolvedValue("a,b\n1,2"),
    parsePublicSheetUrl: vi.fn().mockReturnValue({ sheetId: "abc", gid: "0" }),
    previewWorkflowImport: vi.fn().mockResolvedValue({
      id: "p1",
      token: "tok",
      csvHash: "hash",
      mapping: {},
      mappingDetails: {},
      duplicates: [],
      unknowns: [],
      rows: [],
    }),
    ...overrides,
  } as unknown as Parameters<typeof handlePreviewRequest>[1];
}

describe("POST /api/workflow/import/preview", () => {
  it("returns 403 when import_workflow denied", async () => {
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ sheetUrl: "https://docs.google.com/spreadsheets/d/abc/edit" }) });
    const response = await handlePreviewRequest(request, deniedDeps());
    expect(response.status).toBe(403);
  });

  it("returns 422 for invalid sheet URL", async () => {
    const deps = allowedDeps({
      parsePublicSheetUrl: vi.fn().mockImplementation(() => { throw new Error("Invalid Google Sheet URL"); }),
    });
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ sheetUrl: "https://evil.test/spreadsheets/d/abc" }) });
    const response = await handlePreviewRequest(request, deps as never);
    expect(response.status).toBe(422);
  });

  it("returns 422 for missing body fields", async () => {
    const deps = allowedDeps();
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({}) });
    const response = await handlePreviewRequest(request, deps as never);
    expect(response.status).toBe(422);
  });

  it("returns 200 with preview on success", async () => {
    const deps = allowedDeps();
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ sheetUrl: "https://docs.google.com/spreadsheets/d/abc123/edit#gid=0" }) });
    const response = await handlePreviewRequest(request, deps as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.token).toBe("tok");
  });

  it("returns 422 when fetch reports disallowed redirect", async () => {
    const deps = allowedDeps({
      fetchSheetCsv: vi.fn().mockRejectedValue(new Error("redirect to disallowed host")),
    });
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ sheetUrl: "https://docs.google.com/spreadsheets/d/abc/edit" }) });
    const response = await handlePreviewRequest(request, deps as never);
    expect(response.status).toBe(422);
  });

  it("accepts direct csv input without sheetUrl", async () => {
    const deps = allowedDeps();
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ csv: "a,b\n1,2" }) });
    const response = await handlePreviewRequest(request, deps as never);
    expect(response.status).toBe(200);
  });
});
