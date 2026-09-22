import { db } from "@/db";
import { content, operatorRuns, operatorStrategies } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";
import { desc, eq } from "drizzle-orm";

export interface StrategyInput {
  objective: string;
  audience: string;
  pillars: string[];
  cadencePerWeek?: number;
  videosPerRun?: number;
  defaultFormat?: string;
  defaultLength?: string;
  primaryKpi?: string;
  targetValue?: number | null;
  targetWindowDays?: number;
  monthlyBudget?: number | null;
  currency?: string;
  guardrails?: Record<string, unknown>;
}

export async function upsertStrategy(input: StrategyInput): Promise<typeof operatorStrategies.$inferSelect> {
  const [existing] = (await db.select().from(operatorStrategies).limit(1)) as unknown as Array<typeof operatorStrategies.$inferSelect>;
  if (existing) {
    const [updated] = await db
      .update(operatorStrategies)
      .set({ ...input, pillars: input.pillars as never, guardrails: (input.guardrails ?? {}) as never, updatedAt: new Date() } as never)
      .where(eq(operatorStrategies.id, existing.id))
      .returning();
    return updated as unknown as typeof operatorStrategies.$inferSelect;
  }
  const id = generateEntityId("WIB");
  const [created] = await db
    .insert(operatorStrategies)
    .values({ id, ...input, pillars: input.pillars as never, guardrails: (input.guardrails ?? {}) as never } as never)
    .returning();
  return created as unknown as typeof operatorStrategies.$inferSelect;
}

export async function getStrategy(): Promise<typeof operatorStrategies.$inferSelect | null> {
  const [row] = (await db.select().from(operatorStrategies).limit(1)) as unknown as Array<typeof operatorStrategies.$inferSelect>;
  return row ?? null;
}

export async function activateStrategy(): Promise<typeof operatorStrategies.$inferSelect | null> {
  const s = await getStrategy();
  if (!s) return null;
  const [updated] = await db.update(operatorStrategies).set({ status: "active", updatedAt: new Date() } as never).where(eq(operatorStrategies.id, s.id)).returning();
  return updated as unknown as typeof operatorStrategies.$inferSelect;
}

export async function runOperatorNow(): Promise<{ runId: string; plan: Record<string, unknown>[] }> {
  const strategy = await getStrategy();
  if (!strategy) throw new Error("استراتژی یافت نشد — ابتدا هدف و محورها را ذخیره کنید.");
  // Research: recent topics to avoid duplication
  let recentTitles: string[] = [];
  try {
    const rows = (await db.select({ title: content.title }).from(content).orderBy(desc(content.createdAt)).limit(10)) as unknown as Array<{ title: string }>;
    recentTitles = rows.map((r) => r.title.toLowerCase());
  } catch {}
  // Build editorial plan: one item per pillar per run, with guardrails check
  const pillars = (strategy.pillars ?? []) as string[];
  const guardBlocked = ((strategy.guardrails as Record<string, unknown>)?.blockedTopics as string[] | undefined) ?? [];
  const plan: Record<string, unknown>[] = [];
  const count = Math.min(strategy.videosPerRun ?? 2, pillars.length || 2);
  for (let i = 0; i < count; i++) {
    const pillar = pillars[i % pillars.length] ?? `محور ${i + 1}`;
    if (guardBlocked.some((b) => pillar.toLowerCase().includes(String(b).toLowerCase()))) continue;
    // Avoid duplicate titles
    const titleBase = `${pillar}: ${strategy.objective.slice(0, 40)} — قسمت ${i + 1}`;
    if (recentTitles.some((t) => t.includes(pillar.toLowerCase()))) continue;
    plan.push({
      pillar,
      title: titleBase,
      format: strategy.defaultFormat,
      length: strategy.defaultLength,
      status: "planned",
      evidence: `استراتژی: ${strategy.objective} · مخاطب: ${strategy.audience}`,
    });
  }
  if (!plan.length) {
    // Fallback: at least one generic plan
    plan.push({ pillar: pillars[0] ?? "عمومی", title: `${strategy.objective.slice(0, 60)}`, format: strategy.defaultFormat, status: "planned" });
  }
  const runId = generateEntityId("WIB");
  await db.insert(operatorRuns).values({ id: runId, strategyId: strategy.id, status: "completed", plan: plan as never, progress: { created: plan.length } as never } as never);
  // Optionally create draft content rows for each plan item
  for (const item of plan) {
    try {
      const { createContentRecord } = await import("@/lib/telegram/tgdb");
      await createContentRecord({
        title: String(item.title),
        description: `اپراتور خودکار — محور: ${item.pillar}`,
        caption: "",
        hashtags: [],
        media: [],
        platformTargets: [],
        tags: [String(item.pillar)],
        notes: `auto-operator run ${runId}`,
        createdBy: "operator",
      } as never);
    } catch {}
  }
  return { runId, plan };
}

export async function listRuns(): Promise<Array<typeof operatorRuns.$inferSelect>> {
  return (await db.select().from(operatorRuns).orderBy(desc(operatorRuns.createdAt)).limit(20)) as unknown as Array<typeof operatorRuns.$inferSelect>;
}
