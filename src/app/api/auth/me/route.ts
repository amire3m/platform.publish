import { getCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { effectivePermissions } from "@/lib/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("وارد نشده‌اید.", 401);
  return jsonOk({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    telegramId: user.telegramId,
    permissions: Array.from(effectivePermissions(user)),
    allowedAccountIds: user.allowedAccountIds,
    allowedChannels: (user as unknown as { allowedChannels?: string[] }).allowedChannels ?? [],
  });
}
