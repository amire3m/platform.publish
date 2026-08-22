import { describe, expect, it, vi, beforeEach } from "vitest";
import { jsonError } from "@/lib/api-helpers";
import { handleTemplatesRequest, type TemplatesRouteDependencies } from "./route";

function deps(overrides: Partial<TemplatesRouteDependencies> = {}): TemplatesRouteDependencies {
  const user = { id: "u1", role: "manager" };
  const requirePermission = vi.fn().mockImplementation(async (perm: string) => {
    if (perm === "manage_workflow_templates" && (user as { role: string }).role !== "manager" && (user as { role: string }).role !== "owner") {
      return { user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") };
    }
    return { user, response: null };
  });
  return {
    requirePermission: overrides.requirePermission ?? (requirePermission as never),
    repository: overrides.repository ?? {
      createTemplate: vi.fn().mockResolvedValue({ id: "WTM-1405-000001", name: "قالب", version: 1 }),
    },
    listTemplates: overrides.listTemplates ?? vi.fn().mockResolvedValue([]),
  } as unknown as TemplatesRouteDependencies;
}

describe("GET/POST /api/workflow/templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects creation without manage_workflow_templates", async () => {
    const repository = { createTemplate: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") });
    const response = await handleTemplatesRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ name: "قالب" }) }),
      {
        requirePermission: requirePermission as never,
        repository: repository as never,
        listTemplates: vi.fn(),
      },
    );
    expect(response.status).toBe(403);
    expect(repository.createTemplate).not.toHaveBeenCalled();
  });

  it("returns 422 for missing template name", async () => {
    const repository = { createTemplate: vi.fn() };
    const response = await handleTemplatesRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ name: "" }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.createTemplate).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid item payload and does not call repository", async () => {
    const repository = { createTemplate: vi.fn() };
    const response = await handleTemplatesRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ name: "قالب", items: [{ name: "" }] }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(422);
    expect(repository.createTemplate).not.toHaveBeenCalled();
  });

  it("creates template with valid data", async () => {
    const repository = { createTemplate: vi.fn().mockResolvedValue({ id: "WTM-1", name: "قالب" }) };
    const response = await handleTemplatesRequest(
      new Request("http://test", { method: "POST", body: JSON.stringify({ name: "قالب", description: "توضیح" }) }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(201);
    expect(repository.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: "قالب" }));
  });

  it("rejects list without view_workflow", async () => {
    const repository = { createTemplate: vi.fn() };
    const requirePermission = vi.fn().mockResolvedValue({ user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") });
    const response = await handleTemplatesRequest(new Request("http://test", { method: "GET" }), {
      requirePermission: requirePermission as never,
      repository: repository as never,
      listTemplates: vi.fn(),
    });
    expect(response.status).toBe(401);
  });

  it("lists templates with view_workflow", async () => {
    const repository = { createTemplate: vi.fn() };
    const listTemplates = vi.fn().mockResolvedValue([{ id: "WTM-1", name: "قالب" }]);
    const response = await handleTemplatesRequest(new Request("http://test", { method: "GET" }), deps({ repository: repository as never, listTemplates: listTemplates as never }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(listTemplates).toHaveBeenCalled();
  });

  it("creates template with items and destinations", async () => {
    const repository = { createTemplate: vi.fn().mockResolvedValue({ id: "WTM-1", name: "قالب" }) };
    const response = await handleTemplatesRequest(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({
          name: "قالب",
          items: [{ name: "ویدیو", kind: "video", destinations: [{ platform: "youtube" }] }],
        }),
      }),
      deps({ repository: repository as never }),
    );
    expect(response.status).toBe(201);
    expect(repository.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ name: "ویدیو" })]),
      }),
    );
  });
});
