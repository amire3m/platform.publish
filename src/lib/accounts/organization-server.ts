import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { MAIN_REPORT_ORGANIZATION } from "./organization";

export async function listMainReportAccountIds(platform?: "youtube" | "instagram"): Promise<string[]> {
  const conditions = [eq(socialAccounts.organization, MAIN_REPORT_ORGANIZATION)];
  if (platform) conditions.push(eq(socialAccounts.platform, platform));
  const rows = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(and(...conditions));
  return rows.map((row) => row.id);
}
