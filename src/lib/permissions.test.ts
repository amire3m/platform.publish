import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  effectivePermissions,
  hasPermission,
} from "./permissions";

describe("content room permissions", () => {
  it("registers view_content_room, update_assigned_content, manage_content_room", () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining(["view_content_room", "update_assigned_content", "manage_content_room"]),
    );
  });

  it("gives owner all content room permissions", () => {
    const perms = ROLE_DEFAULT_PERMISSIONS.owner;
    expect(perms).toEqual(expect.arrayContaining(["view_content_room", "update_assigned_content", "manage_content_room"]));
    expect(hasPermission({ role: "owner" }, "view_content_room")).toBe(true);
    expect(hasPermission({ role: "owner" }, "manage_content_room")).toBe(true);
  });

  it("gives manager manage_content_room and mirrors workflow manage_programs", () => {
    const mgr = effectivePermissions({ role: "manager" });
    expect(mgr.has("manage_content_room")).toBe(true);
    expect(mgr.has("view_content_room")).toBe(true);
    expect(mgr.has("update_assigned_content")).toBe(true);
    expect(hasPermission({ role: "manager" }, "manage_content_room")).toBe(true);
  });

  it("gives editor view + update_assigned but not manage", () => {
    const ed = effectivePermissions({ role: "editor" });
    expect(ed.has("view_content_room")).toBe(true);
    expect(ed.has("update_assigned_content")).toBe(true);
    expect(ed.has("manage_content_room")).toBe(false);
  });

  it("gives viewer view only", () => {
    const viewer = effectivePermissions({ role: "viewer" });
    expect(viewer.has("view_content_room")).toBe(true);
    expect(viewer.has("update_assigned_content")).toBe(false);
    expect(viewer.has("manage_content_room")).toBe(false);
  });

  it("allows extra allowedActions to grant content room perms", () => {
    const user = { role: "viewer", allowedActions: ["manage_content_room"] };
    expect(hasPermission(user, "manage_content_room")).toBe(true);
  });
});
