import { getCurrentUser, getImpersonation, IMPERSONATION_TTL_MS } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { effectivePermissions } from "@/lib/permissions";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("وارد نشده‌اید.", 401);
  const imp = await getImpersonation();
  let impersonatedBy: { id: string; name: string } | null = null;
  let impersonationExpiresAt: string | null = null;
  if (imp && !imp.expired) {
    const [owner] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, imp.ownerId)).limit(1);
    if (owner) {
      impersonatedBy = { id: owner.id, name: owner.name };
      impersonationExpiresAt = new Date(imp.startedAt + IMPERSONATION_TTL_MS).toISOString();
    }
  }
  return jsonOk({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    telegramId: user.telegramId,
    permissions: Array.from(effectivePermissions(user)),
    allowedAccountIds: user.allowedAccountIds,
    allowedChannels: (user as unknown as { allowedChannels?: string[] }).allowedChannels ?? [],
    jobFunctions: (user as unknown as { jobFunctions?: string[] }).jobFunctions ?? [],
    impersonatedBy,
    impersonationExpiresAt,
  });
}
