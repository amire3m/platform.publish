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
  | "manage_settings";

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
  ],
  editor: ["view_content", "upload_content", "edit_content", "submit_for_review"],
  publisher: ["view_content", "publish_now", "schedule_content", "view_analytics"],
  analyst: ["view_content", "view_analytics", "export_data"],
  viewer: ["view_content"],
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

/** Channel/page level scoping: owner & manager-with-empty-list see everything. */
export function canAccessAccount(user: PermissionSubject, accountId: string): boolean {
  if (user.role === "owner") return true;
  const allowed = user.allowedAccountIds ?? [];
  if (allowed.length === 0) return true; // empty = no explicit restriction configured yet
  return allowed.includes(accountId);
}
