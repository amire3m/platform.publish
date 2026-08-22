import { describe, expect, it } from "vitest";

import { effectivePermissions } from "@/lib/permissions";

describe("workflow role permissions", () => {
  it("grants owners every workflow permission", () => {
    for (const permission of [
      "view_workflow",
      "manage_programs",
      "update_assigned_deliverables",
      "manage_publications",
      "manage_workflow_templates",
      "import_workflow",
    ] as const) {
      expect(effectivePermissions({ role: "owner" }).has(permission)).toBe(true);
    }
  });

  it("grants each operational role only its workflow defaults", () => {
    expect(effectivePermissions({ role: "manager" }).has("manage_programs")).toBe(true);
    expect(effectivePermissions({ role: "manager" }).has("import_workflow")).toBe(true);
    expect(effectivePermissions({ role: "editor" }).has("update_assigned_deliverables")).toBe(true);
    expect(effectivePermissions({ role: "editor" }).has("manage_programs")).toBe(false);
    expect(effectivePermissions({ role: "publisher" }).has("manage_publications")).toBe(true);
    expect(effectivePermissions({ role: "viewer" }).has("view_workflow")).toBe(true);
  });
});
