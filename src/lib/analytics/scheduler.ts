import { isNull, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { analyticsRepository } from "@/lib/analytics/repository";
import {
  syncYouTubeAccounts,
  type AccountSyncResult,
} from "@/lib/analytics/sync";
import { startOfTehranDayUtc } from "@/lib/date/jalali";

export interface AnalyticsSchedulerDependencies {
  claimDailyRun(now: Date, dayStartUtc: Date): Promise<boolean>;
  listSyncableAccountIds(): Promise<string[]>;
  syncAccounts(
    ids: readonly string[],
    options?: { now?: Date; dimensions?: string[] },
  ): Promise<AccountSyncResult[]>;
}

export function createAnalyticsScheduler(deps: AnalyticsSchedulerDependencies): {
  run(now?: Date): Promise<{ ran: boolean; results: AccountSyncResult[] }>;
} {
  return {
    async run(now = new Date()) {
      const dayStartUtc = startOfTehranDayUtc(now);
      if (!await deps.claimDailyRun(now, dayStartUtc)) {
        return { ran: false, results: [] };
      }

      const accountIds = await deps.listSyncableAccountIds();
      // Dimension syncs (geo/audience/device/traffic/search/retention/revenue) power the
      // Traffic, Audience, Search, and Retention tabs — run them with every daily sync.
      const results = await deps.syncAccounts(accountIds, {
        now,
        dimensions: ["geo", "audience", "device", "traffic", "search", "retention", "revenue"],
      });
      return { ran: true, results };
    },
  };
}

const scheduler = createAnalyticsScheduler({
  async claimDailyRun(now, dayStartUtc) {
    const claimed = await db
      .insert(appSettings)
      .values({ id: 1, lastAnalyticsRunAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { lastAnalyticsRunAt: now, updatedAt: now },
        setWhere: or(
          isNull(appSettings.lastAnalyticsRunAt),
          lt(appSettings.lastAnalyticsRunAt, dayStartUtc),
        ),
      })
      .returning({ id: appSettings.id });
    return claimed.length > 0;
  },
  async listSyncableAccountIds() {
    return (await analyticsRepository.listSyncableAccounts()).map(({ id }) => id);
  },
  syncAccounts: syncYouTubeAccounts,
});

export async function runScheduledAnalyticsSync(
  now?: Date,
): Promise<{ ran: boolean; results: AccountSyncResult[] }> {
  return scheduler.run(now);
}
