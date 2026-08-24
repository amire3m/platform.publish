export const ACCOUNT_ORGANIZATIONS = ["emro", "sana"] as const;
export type AccountOrganization = (typeof ACCOUNT_ORGANIZATIONS)[number];

export const MAIN_REPORT_ORGANIZATION: AccountOrganization = "emro";
export const MAIN_REPORT_ALIAS = "Emro YT";

export const ORGANIZATION_LABELS: Record<AccountOrganization, string> = {
  emro: "موسسه امام روح‌الله",
  sana: "سنا",
};

export function restrictAccountScopeToOrganization(
  allowedAccountIds: readonly string[] | null,
  organizationAccountIds: readonly string[],
): string[] {
  if (allowedAccountIds === null) return [...organizationAccountIds];
  const allowed = new Set(allowedAccountIds);
  return organizationAccountIds.filter((id) => allowed.has(id));
}
