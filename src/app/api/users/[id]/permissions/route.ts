import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { CHANNEL_IDS } from "@/lib/channels";

const MANAGER_LIMITED_PERMISSIONS = new Set<string>([
  "manage_users",
  "manage_settings",
  "manage_accounts",
]);

async function handlePermissionsUpdate(req: Request, params: Promise<{ id: string }>) {
  // Allow owner or manager with manage_users; manager is limited afterwards
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    const { response } = await requirePermission("manage_users");
    return response!;
  }
  // Check permission via requirePermission logic but allow manager limited
  // If user lacks manage_users and is not owner/manager, forbid
  const { user, response } = await requirePermission("manage_users");
  // If requirePermission fails but user is manager, allow limited edit (fallback to currentUser)
  let actor = user;
  if (!actor) {
    // If currentUser is manager, allow limited scope
    if (currentUser.role === "manager") {
      actor = currentUser as typeof user & { role: string };
    } else {
      return response!;
    }
  }
  const { id } = await params;

  const body = (await req.json()) as {
    allowedActions?: string[];
    allowedAccountIds?: string[];
    allowedChannels?: string[];
  };
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return jsonError("کاربر یافت نشد.", 404);

  // Validate allowedActions
  let allowedActions = (body.allowedActions ?? []).filter((a) => (ALL_PERMISSIONS as string[]).includes(a));

  // Validate allowedChannels: must be subset of CHANNEL_IDS (6)
  let allowedChannels: string[] | undefined = undefined;
  if (body.allowedChannels !== undefined) {
    if (!Array.isArray(body.allowedChannels)) return jsonError("فهرست کانال‌های مجاز نامعتبر است.", 400);
    const invalid = body.allowedChannels.filter((c) => !(CHANNEL_IDS as readonly string[]).includes(c));
    if (invalid.length) return jsonError("یک یا چند کانال انتخاب‌شده معتبر نیستند.", 400);
    allowedChannels = [...new Set(body.allowedChannels)];
  }

  // Manager limited: cannot grant sensitive permissions
  if (actor && actor.role === "manager") {
    // filter out limited perms if manager tries to set them without having them
    const forbidden = allowedActions.filter((a) => MANAGER_LIMITED_PERMISSIONS.has(a));
    if (forbidden.length) {
      return jsonError("مدیر نمی‌تواند دسترسی‌های مدیریتی حساس را اعطا کند.", 403);
    }
    // manager cannot edit owner-protected user
    if ((existing as unknown as { isOwnerProtected: boolean }).isOwnerProtected) {
      return jsonError("مدیر نمی‌تواند دسترسی مالک را تغییر دهد.", 403);
    }
    // manager cannot assign allowedChannels outside their own? For now allow but could restrict
  }

  // Owner can edit all – no extra restriction

  const existingChannels = (existing as unknown as { allowedChannels?: string[] }).allowedChannels ?? [];

  const updatePayload: Record<string, unknown> = {
    allowedActions,
    updatedAt: new Date(),
  };
  if (body.allowedAccountIds !== undefined) updatePayload.allowedAccountIds = body.allowedAccountIds;
  if (allowedChannels !== undefined) updatePayload.allowedChannels = allowedChannels;

  const [row] = await db
    .update(users)
    .set(updatePayload as never)
    .where(eq(users.id, id))
    .returning();

  await appendAuditEvent({
    actorTelegramId: actor.telegramId,
    actorUserId: actor.id,
    action: "user_permissions_updated",
    entityType: "user",
    entityId: id,
    before: {
      allowedActions: existing.allowedActions,
      allowedAccountIds: existing.allowedAccountIds,
      allowedChannels: existingChannels,
    },
    after: {
      allowedActions: (row as unknown as { allowedActions: string[] }).allowedActions,
      allowedAccountIds: (row as unknown as { allowedAccountIds: string[] }).allowedAccountIds,
      allowedChannels: (row as unknown as { allowedChannels: string[] }).allowedChannels,
    },
  });

  return jsonOk(row);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlePermissionsUpdate(req, params);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlePermissionsUpdate(req, params);
}
