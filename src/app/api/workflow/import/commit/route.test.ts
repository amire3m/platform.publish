import { describe, it, expect, vi } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleCommitRequest } from "./route";
import { ImportError } from "@/lib/workflow/import/import-service";

function deniedDeps() {
  return {
    requirePermission: vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") }),
    commitWorkflowImport: vi.fn(),
  } as unknown as Parameters<typeof handleCommitRequest>[1];
}

function allowedDeps(overrides: Record<string, unknown> = {}) {
  const user = { id: "u1", role: "manager", allowedActions: ["import_workflow"] };
  const requirePermission = vi.fn().mockResolvedValue({ user, response: null });
  return {
    requirePermission,
    commitWorkflowImport: vi.fn().mockResolvedValue({ batchId: "b1", results: [], counts: {} }),
    ...overrides,
  } as unknown as Parameters<typeof handleCommitRequest>[1];
}

describe("POST /api/workflow/import/commit", () => {
  it("returns 403 when import_workflow denied", async () => {
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ token: "t", rows: [{ rowIndex: 0, action: "skip" }] }) });
    const response = await handleCommitRequest(request, deniedDeps());
    expect(response.status).toBe(403);
  });

  it("returns 410 for expired preview", async () => {
    const deps = allowedDeps({
      commitWorkflowImport: vi.fn().mockRejectedValue(new ImportError("PREVIEW_EXPIRED", "منقضی")),
    });
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ token: "expired", rows: [{ rowIndex: 0, action: "skip" }] }) });
    const response = await handleCommitRequest(request, deps as never);
    expect(response.status).toBe(410);
  });

  it("returns 409 for terminal conflict", async () => {
    const deps = allowedDeps({
      commitWorkflowImport: vi.fn().mockRejectedValue(new ImportError("TERMINAL_OVERWRITE_BLOCKED", "پایانی")),
    });
    const conflictRequest = new Request("http://test", { method: "POST", body: JSON.stringify({ token: "tok", rows: [{ rowIndex: 0, action: "update", programId: "p1" }] }) });
    const response = await handleCommitRequest(conflictRequest, deps as never);
    expect(response.status).toBe(409);
  });

  it("returns 422 for program selection required", async () => {
    const deps = allowedDeps({
      commitWorkflowImport: vi.fn().mockRejectedValue(new ImportError("PROGRAM_SELECTION_REQUIRED", "انتخاب برنامه الزامی است")),
    });
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ token: "tok", rows: [{ rowIndex: 0, action: "update" }] }) });
    const response = await handleCommitRequest(request, deps as never);
    expect(response.status).toBe(422);
  });

  it("returns 422 for validation error on body", async () => {
    const deps = allowedDeps();
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ token: "", rows: [] }) });
    const response = await handleCommitRequest(request, deps as never);
    expect(response.status).toBe(422);
  });

  it("returns 200 on success", async () => {
    const deps = allowedDeps();
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ token: "tok", rows: [{ rowIndex: 0, action: "create" }] }) });
    const response = await handleCommitRequest(request, deps as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it("returns 500 for generic import failed", async () => {
    const deps = allowedDeps({
      commitWorkflowImport: vi.fn().mockRejectedValue(new ImportError("IMPORT_FAILED", "خطا")),
    });
    const request = new Request("http://test", { method: "POST", body: JSON.stringify({ token: "tok", rows: [{ rowIndex: 0, action: "create" }] }) });
    const response = await handleCommitRequest(request, deps as never);
    expect(response.status).toBe(500);
  });
});
