import { db } from "@/db";
import { content, contentParts } from "@/db/schema";
import { radarItems, radarRuns } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";
import { cosineSimilarity, extractKeywords } from "./keywords";
import { searchYouTube } from "./youtube";
import { searchInstagramExplore } from "./instagram";
import { sql } from "drizzle-orm";

export async function runRadarOnce(): Promise<{ runId: string; items: number }> {
  const { desc } = await import("drizzle-orm");
  // 5 most recent published/scheduled contents as seeds
  let seeds: Array<{ id: string; title: string; partId?: string }> = [];
  try {
    const rows = (await db.select({ id: content.id, title: content.title }).from(content).orderBy(desc(content.createdAt)).limit(5)) as unknown as Array<{ id: string; title: string }>;
    seeds = rows;
    // Enrich with first part id for display linkage
    try {
      for (const s of seeds) {
        const [p] = (await db.select({ id: contentParts.id }).from(contentParts).where(sql`${contentParts.productId} = ${s.id}`).limit(1)) as unknown as Array<{ id: string }>;
        if (p) s.partId = p.id;
      }
    } catch {}
  } catch { seeds = []; }

  if (!seeds.length) {
    // Fallback: at least create an empty run so health can show "no content yet"
    const runId = `RDR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0);
    await db.insert(radarRuns).values({ id: runId, weekStart, status: "done" } as never);
    return { runId, items: 0 };
  }

  const runId = `RDR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday start
  await db.insert(radarRuns).values({ id: runId, weekStart, status: "done" } as never);

  let total = 0;
  for (const seed of seeds) {
    const text = seed.title;
    const { fa, en } = extractKeywords(text, 3, 2);
    const queries: Array<{ q: string; lang: "fa" | "en" }> = [
      ...fa.map((q) => ({ q, lang: "fa" as const })),
      ...en.map((q) => ({ q, lang: "en" as const })),
    ];
    // Fallback to full title if no keywords
    if (!queries.length) queries.push({ q: text.slice(0, 40), lang: "fa" });

    for (const { q, lang } of queries.slice(0, 4)) {
      const yt = await searchYouTube(q, 5);
      for (const v of yt) {
        const score = cosineSimilarity(text, v.title);
        if (score < 0.12) continue;
        await db.insert(radarItems).values({
          id: `RDI-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          runId,
          source: "youtube",
          queryLang: lang,
          query: q,
          similarToPartId: seed.partId ?? seed.id,
          similarToTitle: seed.title,
          externalId: v.externalId,
          title: v.title,
          channel: v.channel,
          views: v.views,
          publishedAt: v.publishedAt,
          similarityScore: score,
          thumbUrl: v.thumbUrl,
          permalink: v.permalink,
        } as never);
        total++;
      }
      // Instagram: one query per seed to keep load low (weekly ≈ 5 insta searches)
      if (queries.indexOf({ q, lang } as never) === 0) {
        const ig = await searchInstagramExplore(q, undefined, 5);
        for (const v of ig) {
          const score = cosineSimilarity(text, v.title || q);
          if (score < 0.08) continue;
          await db.insert(radarItems).values({
            id: `RDI-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            runId,
            source: "instagram",
            queryLang: lang,
            query: q,
            similarToPartId: seed.partId ?? seed.id,
            similarToTitle: seed.title,
            externalId: v.externalId,
            title: v.title || q,
            channel: v.channel,
            views: null,
            publishedAt: null,
            similarityScore: score,
            thumbUrl: v.thumbUrl,
            permalink: v.permalink,
          } as never);
          total++;
        }
      }
    }
  }
  return { runId, items: total };
}

export async function getLatestRadar(): Promise<{ run: typeof radarRuns.$inferSelect | null; items: Array<typeof radarItems.$inferSelect> }> {
  const { desc } = await import("drizzle-orm");
  const [run] = (await db.select().from(radarRuns).orderBy(desc(radarRuns.createdAt)).limit(1)) as unknown as Array<typeof radarRuns.$inferSelect>;
  if (!run) return { run: null, items: [] };
  const items = (await db.select().from(radarItems).where(sql`${radarItems.runId} = ${run.id}`).orderBy(desc(radarItems.similarityScore)).limit(100)) as unknown as Array<typeof radarItems.$inferSelect>;
  return { run, items };
}
