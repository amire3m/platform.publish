import { jsonError } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";

/** Live management permission: manage_live, or the legacy manage_content_room / publish_now. */
export async function requireLivePermission() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") };
  const subject = {
    role: (user as unknown as { role: string }).role,
    allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
    allowedAccountIds: (user as unknown as { allowedAccountIds?: string[] }).allowedAccountIds ?? [],
  };
  const perms: Permission[] = ["manage_live", "manage_content_room", "publish_now"];
  const ok = perms.some((p) => hasPermission(subject, p));
  if (!ok) return { user: null, response: jsonError("شما مجوز مدیریت لایو را ندارید.", 403, "FORBIDDEN") };
  return { user, response: null };
}
