// Role-based + fine-grained permission model.
export type Permission =
  | "view_content"
  | "upload_content"
  | "edit_content"
  | "delete_content"
  | "submit_for_review"
  | "approve_content"
  | "schedule_content"
  | "publish_now"
  | "manage_accounts"
  | "manage_users"
  | "view_analytics"
  | "export_data"
  | "manage_settings"
  | "view_workflow"
  | "manage_programs"
  | "update_assigned_deliverables"
  | "manage_publications"
  | "manage_workflow_templates"
  | "import_workflow"
  | "view_mail"
  | "manage_mail"
  | "view_content_room"
  | "update_assigned_content"
  | "manage_content_room";

export type Role = "owner" | "manager" | "editor" | "publisher" | "analyst" | "viewer";

export const ALL_PERMISSIONS: Permission[] = [
  "view_content",
  "upload_content",
  "edit_content",
  "delete_content",
  "submit_for_review",
  "approve_content",
  "schedule_content",
  "publish_now",
  "manage_accounts",
  "manage_users",
  "view_analytics",
  "export_data",
  "manage_settings",
  "view_workflow",
  "manage_programs",
  "update_assigned_deliverables",
  "manage_publications",
  "manage_workflow_templates",
  "import_workflow",
  "view_mail",
  "manage_mail",
  "view_content_room",
  "update_assigned_content",
  "manage_content_room",
];

export const ROLE_LABELS_FA: Record<Role, string> = {
  owner: "مالک",
  manager: "مدیر",
  editor: "ویرایشگر",
  publisher: "ناشر",
  analyst: "تحلیل‌گر",
  viewer: "بیننده",
};

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [...ALL_PERMISSIONS],
  manager: [
    "view_content",
    "upload_content",
    "edit_content",
    "submit_for_review",
    "approve_content",
    "schedule_content",
    "view_analytics",
    "export_data",
    "view_workflow",
    "manage_programs",
    "update_assigned_deliverables",
    "manage_publications",
    "manage_workflow_templates",
    "import_workflow",
    "view_content_room",
    "update_assigned_content",
    "manage_content_room",
  ],
  editor: [
    "view_content",
    "upload_content",
    "edit_content",
    "submit_for_review",
    "view_workflow",
    "update_assigned_deliverables",
    "view_content_room",
    "update_assigned_content",
  ],
  publisher: ["view_content", "publish_now", "schedule_content", "view_analytics", "view_workflow", "manage_publications", "view_content_room"],
  analyst: ["view_content", "view_analytics", "export_data", "view_workflow", "view_content_room"],
  viewer: ["view_content", "view_workflow", "view_content_room"],
};

export interface PermissionSubject {
  role: string;
  allowedActions?: string[] | null;
  allowedAccountIds?: string[] | null;
}

export function effectivePermissions(user: PermissionSubject): Set<Permission> {
  const role = (user.role as Role) in ROLE_DEFAULT_PERMISSIONS ? (user.role as Role) : "viewer";
  const set = new Set<Permission>(ROLE_DEFAULT_PERMISSIONS[role]);
  for (const extra of user.allowedActions ?? []) {
    if ((ALL_PERMISSIONS as string[]).includes(extra)) set.add(extra as Permission);
  }
  return set;
}

export function hasPermission(user: PermissionSubject, permission: Permission): boolean {
  return effectivePermissions(user).has(permission);
}

export function normalizeAllowedAccountIds(
  allowedAccountIds: readonly string[] | null | undefined,
): readonly string[] | null {
  return !allowedAccountIds || allowedAccountIds.length === 0 ? null : allowedAccountIds;
}

export function accountScopeForUser(user: PermissionSubject): readonly string[] | null {
  return user.role === "owner" ? null : normalizeAllowedAccountIds(user.allowedAccountIds);
}

/** Channel/page level scoping: owner & manager-with-empty-list see everything. */
export function canAccessAccount(user: PermissionSubject, accountId: string): boolean {
  const allowed = accountScopeForUser(user);
  return allowed === null || allowed.includes(accountId);
}
