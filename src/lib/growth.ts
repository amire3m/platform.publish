import { db } from "@/db";
import { growthExperimentArms, growthExperiments } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";
import { eq } from "drizzle-orm";

export async function createExperiment(contentId: string, variants: Array<{ title: string; thumbnailUrl?: string }>, opts?: { armDurationHours?: number; minImpressions?: number }) {
  const expId = generateEntityId("WIB");
  await db.insert(growthExperiments).values({
    id: expId,
    contentId,
    status: "draft",
    armDurationHours: opts?.armDurationHours ?? 48,
    minImpressions: opts?.minImpressions ?? 1000,
  } as never);
  // Control is current title
  const { content } = await import("@/db/schema");
  const [row] = await db.select().from(content).where(eq(content.id, contentId)).limit(1);
  const controlTitle = String((row as unknown as { title: string }).title ?? "Control");
  await db.insert(growthExperimentArms).values({ id: generateEntityId("WIB"), experimentId: expId, title: controlTitle, isControl: true } as never);
  for (const v of variants.slice(0, 2)) {
    await db.insert(growthExperimentArms).values({ id: generateEntityId("WIB"), experimentId: expId, title: v.title, thumbnailUrl: v.thumbnailUrl ?? null } as never);
  }
  return expId;
}

export async function startExperiment(expId: string) {
  await db.update(growthExperiments).set({ status: "running", startedAt: new Date() } as never).where(eq(growthExperiments.id, expId));
}

export async function recordArmMetrics(armId: string, impressions: number, clicks: number) {
  const ctr = impressions ? (clicks / impressions) * 100 : 0;
  await db.update(growthExperimentArms).set({ impressions, clicks, ctr } as never).where(eq(growthExperimentArms.id, armId));
}

export async function evaluateExperiment(expId: string): Promise<{ winner: string | null; reason: string; arms: Array<{ id: string; ctr: number; impressions: number }> }> {
  const arms = (await db.select().from(growthExperimentArms).where(eq(growthExperimentArms.experimentId, expId))) as unknown as Array<{ id: string; ctr: number; impressions: number; isControl: boolean }>;
  if (arms.length < 2) return { winner: null, reason: "آزمایش ناقص است.", arms: arms.map((a) => ({ id: a.id, ctr: Number(a.ctr), impressions: a.impressions })) };
  const minImp = 500;
  const ready = arms.every((a) => a.impressions >= minImp);
  if (!ready) return { winner: null, reason: "هنوز به حد نصاب impression نرسیده.", arms: arms.map((a) => ({ id: a.id, ctr: Number(a.ctr), impressions: a.impressions })) };
  const sorted = [...arms].sort((a, b) => Number(b.ctr) - Number(a.ctr));
  const leader = sorted[0];
  const runner = sorted[1];
  const uplift = Number(runner.ctr) ? ((Number(leader.ctr) - Number(runner.ctr)) / Number(runner.ctr)) * 100 : 0;
  if (uplift < 10) return { winner: null, reason: `نتیجه نامشخص — برتری ${uplift.toFixed(1)}% زیر آستانه ۱۰٪.`, arms: arms.map((a) => ({ id: a.id, ctr: Number(a.ctr), impressions: a.impressions })) };
  // 95% simplified: require at least 10% uplift without retention regression (retention not tracked here, assume ok)
  await db.update(growthExperiments).set({ status: "completed", winnerArmId: leader.id, completedAt: new Date() } as never).where(eq(growthExperiments.id, expId));
  return { winner: leader.id, reason: `برنده با CTR ${Number(leader.ctr).toFixed(2)}% (+${uplift.toFixed(1)}%).`, arms: arms.map((a) => ({ id: a.id, ctr: Number(a.ctr), impressions: a.impressions })) };
}

export async function listExperiments(contentId?: string) {
  const { desc } = await import("drizzle-orm");
  if (contentId) return (await db.select().from(growthExperiments).where(eq(growthExperiments.contentId, contentId)).orderBy(desc(growthExperiments.createdAt))) as unknown as Array<typeof growthExperiments.$inferSelect>;
  return (await db.select().from(growthExperiments).orderBy(desc(growthExperiments.createdAt)).limit(20)) as unknown as Array<typeof growthExperiments.$inferSelect>;
}

export async function getOutcome() {
  const { outcomeSettings } = await import("@/db/schema");
  const [row] = (await db.select().from(outcomeSettings).limit(1)) as unknown as Array<typeof outcomeSettings.$inferSelect>;
  if (row) return row;
  await db.insert(outcomeSettings).values({ id: 1 } as never).catch(() => {});
  const [created] = (await db.select().from(outcomeSettings).limit(1)) as unknown as Array<typeof outcomeSettings.$inferSelect>;
  return created;
}

export async function saveOutcome(patch: Partial<{ primaryKpi: string; targetValue: number | null; targetWindowDays: number; monthlyBudget: number | null; currency: string }>) {
  const { outcomeSettings } = await import("@/db/schema");
  await db.update(outcomeSettings).set({ ...patch, updatedAt: new Date() } as never).where(eq(outcomeSettings.id, 1));
  return getOutcome();
}

export async function buildOutcomeProgress() {
  const settings = await getOutcome();
  // Aggregate from analyticsSnapshots for the window
  let views = 0, subs = 0, watchHours = 0, revenue: number | null = null;
  try {
    const { analyticsSnapshots } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    const since = new Date(Date.now() - (settings.targetWindowDays ?? 28) * 86400000);
    const rows = (await db.select().from(analyticsSnapshots).where(sql`${analyticsSnapshots.dateUtc} >= ${since}`)) as unknown as Array<Record<string, unknown>>;
    for (const r of rows) {
      views += Number(r.views ?? 0);
      subs += Number(r.subscribersGained ?? 0) - Number(r.subscribersLost ?? 0);
      watchHours += Number(r.watchTime ?? 0) / 3600;
      if (r.estimatedRevenue != null) revenue = (revenue ?? 0) + Number(r.estimatedRevenue);
    }
  } catch {}
  const target = Number(settings.targetValue ?? 0);
  const progress = target ? Math.min(100, Math.round((views / target) * 100)) : 0;
  return { settings, metrics: { views, subs, watchHours: Math.round(watchHours), revenue }, progress, hasRevenue: revenue !== null };
}
