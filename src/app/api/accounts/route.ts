import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { requirePermission, jsonOk } from "@/lib/api-helpers";
import { canAccessAccount, type PermissionSubject } from "@/lib/permissions";
import { toPublicAccountDto, type PublicAccountSource } from "@/lib/accounts/public";

export interface AccountsRouteDependencies {
  requirePermission(permission: "view_content"): Promise<{
    user: PermissionSubject | null;
    response: Response | null;
  }>;
  listAccounts(): Promise<readonly PublicAccountSource[]>;
}

const defaultDependencies: AccountsRouteDependencies = {
  requirePermission,
  listAccounts: () => db.select().from(socialAccounts).orderBy(socialAccounts.createdAt),
};

export async function handleAccountsRequest(dependencies: AccountsRouteDependencies): Promise<Response> {
  const { user, response } = await dependencies.requirePermission("view_content");
  if (!user) return response!;
  const rows = await dependencies.listAccounts();
  return jsonOk(rows.filter((row) => canAccessAccount(user, row.id)).map(toPublicAccountDto));
}

export function GET() {
  return handleAccountsRequest(defaultDependencies);
}
