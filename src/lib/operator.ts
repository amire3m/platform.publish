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

async function tryAiPlan(
  strategy: typeof operatorStrategies.$inferSelect,
  recentTitles: string[],
): Promise<Record<string, unknown>[] | null> {
  try {
    const { aiGenerate, isAiConfigured } = await import("@/lib/ai/client");
    if (!isAiConfigured()) return null;
    const pillars = (strategy.pillars ?? []) as string[];
    const prompt = `تو یک استراتژیست محتوای یوتیوب/اینستاگرام هستی. بر اساس این استراتژی یک برنامه تحریریه کامل بده.

هدف کانال: ${strategy.objective}
مخاطب: ${strategy.audience}
محورها: ${pillars.join("، ")}
فرمت پیش‌فرض: ${strategy.defaultFormat} — طول: ${strategy.defaultLength}
KPI: ${strategy.primaryKpi} — هدف: ${strategy.targetValue ?? "نامشخص"} در ${strategy.targetWindowDays} روز
عناوین اخیر (تکراری نساز): ${recentTitles.slice(0, 5).join(" | ") || "ندارد"}
تعداد مورد نیاز: ${strategy.videosPerRun ?? 2}

خروجی فقط JSON آرایه‌ای با ${strategy.videosPerRun ?? 2} آیتم، هر آیتم: {"pillar": "...", "title": "... (جذاب، سئو شده، فارسی)", "hook": "... (قلاب 15 کلمه)", "description": "... (2-3 خط فارسی)", "tags": ["..."], "hashtags": ["..."], "cta": "..."}. فارسی بنویس.`;
    const raw = await aiGenerate(prompt, { systemPrompt: "تو یک متخصص استراتژی محتوای فارسی هستی. فقط JSON معتبر برگردان.", temperature: 0.8, maxTokens: 1800 });
    const jsonStr = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1);
    const parsed = JSON.parse(jsonStr) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return parsed.map((p, i) => ({
      pillar: String(p.pillar ?? pillars[i % pillars.length] ?? "عمومی"),
      title: String(p.title ?? "").slice(0, 90) || `ایده ${i + 1}`,
      hook: String(p.hook ?? ""),
      description: String(p.description ?? ""),
      tags: Array.isArray(p.tags) ? (p.tags as string[]).slice(0, 5) : [],
      hashtags: Array.isArray(p.hashtags) ? (p.hashtags as string[]).slice(0, 5) : [],
      cta: String(p.cta ?? ""),
      format: strategy.defaultFormat,
      length: strategy.defaultLength,
      status: "planned",
      evidence: `AI: ${strategy.objective} · ${strategy.audience}`,
      aiGenerated: true,
    }));
  } catch {
    return null;
  }
}

export async function runOperatorNow(): Promise<{ runId: string; plan: Record<string, unknown>[]; aiUsed: boolean }> {
  const strategy = await getStrategy();
  if (!strategy) throw new Error("استراتژی یافت نشد — ابتدا هدف و محورها را ذخیره کنید.");
  let recentTitles: string[] = [];
  try {
    const rows = (await db.select({ title: content.title }).from(content).orderBy(desc(content.createdAt)).limit(10)) as unknown as Array<{ title: string }>;
    recentTitles = rows.map((r) => r.title.toLowerCase());
  } catch {}
  const pillars = (strategy.pillars ?? []) as string[];
  const guardBlocked = ((strategy.guardrails as Record<string, unknown>)?.blockedTopics as string[] | undefined) ?? [];
  let plan: Record<string, unknown>[] = [];
  let aiUsed = false;

  // Try LLM first (full program)
  const aiPlan = await tryAiPlan(strategy, recentTitles);
  if (aiPlan && aiPlan.length) {
    plan = aiPlan.filter((p) => !guardBlocked.some((b) => String(p.pillar).toLowerCase().includes(String(b).toLowerCase())));
    aiUsed = true;
  }

  // Fallback template if AI not configured or failed
  if (!plan.length) {
    const count = Math.min(strategy.videosPerRun ?? 2, pillars.length || 2);
    for (let i = 0; i < count; i++) {
      const pillar = pillars[i % pillars.length] ?? `محور ${i + 1}`;
      if (guardBlocked.some((b) => pillar.toLowerCase().includes(String(b).toLowerCase()))) continue;
      const titleBase = `${pillar}: ${strategy.objective.slice(0, 40)} — قسمت ${i + 1}`;
      if (recentTitles.some((t) => t.includes(pillar.toLowerCase()))) continue;
      plan.push({
        pillar,
        title: titleBase,
        format: strategy.defaultFormat,
        length: strategy.defaultLength,
        status: "planned",
        evidence: `استراتژی: ${strategy.objective} · مخاطب: ${strategy.audience}`,
        aiGenerated: false,
      });
    }
    if (!plan.length) {
      plan.push({ pillar: pillars[0] ?? "عمومی", title: `${strategy.objective.slice(0, 60)}`, format: strategy.defaultFormat, status: "planned", aiGenerated: false });
    }
  }
  const runId = generateEntityId("WIB");
  await db.insert(operatorRuns).values({ id: runId, strategyId: strategy.id, status: "completed", plan: plan as never, progress: { created: plan.length, aiUsed } as never } as never);
  for (const item of plan) {
    try {
      const { createContentRecord } = await import("@/lib/telegram/tgdb");
      await createContentRecord({
        title: String(item.title),
        description: String(item.description ?? `اپراتور خودکار — محور: ${item.pillar} — قلاب: ${item.hook ?? ""}`),
        caption: String(item.hook ?? ""),
        hashtags: (item.hashtags as string[]) ?? [],
        media: [],
        platformTargets: [],
        tags: (item.tags as string[]) ?? [String(item.pillar)],
        notes: `auto-operator run ${runId} — ai:${aiUsed ? "yes" : "no"} — ${item.evidence ?? ""}`,
        createdBy: "operator",
      } as never);
    } catch {}
  }
  return { runId, plan, aiUsed };
}

export async function listRuns(): Promise<Array<typeof operatorRuns.$inferSelect>> {
  return (await db.select().from(operatorRuns).orderBy(desc(operatorRuns.createdAt)).limit(20)) as unknown as Array<typeof operatorRuns.$inferSelect>;
}
