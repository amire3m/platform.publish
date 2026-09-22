import { db } from "@/db";
import { audienceIdeas, engagementComments, engagementDrafts } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";
import { desc, eq, sql } from "drizzle-orm";

function classify(text: string): { sentiment: string; theme: string | null; isSpam: boolean; isQuestion: boolean } {
  const t = text.toLowerCase();
  const spam = /http|buy now|click here|free money|viagra|lottery|ارزان.*کلیک/i.test(text);
  const isQuestion = /؟|\?|چطور|چگونه|چرا|آیا|what|how|why/i.test(text);
  let sentiment: string = "neutral";
  if (/عالی|ممنون|فوق.*العاده|love|great|amazing|thank/i.test(t)) sentiment = "positive";
  else if (/بد|افتضاح|hate|terrible|bad/i.test(t)) sentiment = "negative";
  let theme: string | null = null;
  if (/آموزش|tutorial|learn/i.test(t)) theme = "آموزش";
  else if (/سؤال|question/i.test(t) || isQuestion) theme = "پرسش";
  else if (t.length < 15) theme = "کوتاه";
  return { sentiment, theme, isSpam: spam, isQuestion };
}

export async function syncEngagementComments(videoId?: string): Promise<number> {
  // Best-effort: try YouTube API for recent published videos, fallback to no-op if not configured
  let targets: string[] = videoId ? [videoId] : [];
  if (!targets.length) {
    try {
      const { content } = await import("@/db/schema");
      const rows = (await db.select({ id: content.id, publishResults: content.publishResults }).from(content).where(sql`${content.status} = 'published'`).limit(10)) as unknown as Array<{ publishResults: Array<Record<string, unknown>> }>;
      for (const r of rows) {
        for (const pr of r.publishResults ?? []) {
          const vid = String(pr.externalId ?? pr.external_id ?? "");
          if (vid && !vid.startsWith("mock_")) targets.push(vid);
        }
      }
      targets = [...new Set(targets)].slice(0, 5);
    } catch { targets = []; }
  }
  if (!targets.length) return 0;
  let inserted = 0;
  for (const vid of targets) {
    try {
      const comments = await fetchYouTubeComments(vid);
      for (const c of comments) {
        const { sentiment, theme, isSpam, isQuestion } = classify(c.text);
        const id = generateEntityId("WIB");
        await db.insert(engagementComments).values({ id, videoId: vid, commentId: c.id, author: c.author, text: c.text, sentiment, theme, isSpam, isQuestion } as never).onConflictDoNothing();
        inserted++;
      }
    } catch {}
  }
  // Mine audience ideas: 3+ similar questions
  try {
    const qs = (await db.select().from(engagementComments).where(eq(engagementComments.isQuestion, true)).limit(50)) as unknown as Array<{ text: string; commentId: string }>;
    const groups = new Map<string, string[]>();
    for (const q of qs) {
      const key = q.text.slice(0, 20).toLowerCase();
      const arr = groups.get(key) ?? [];
      arr.push(q.commentId);
      groups.set(key, arr);
    }
    for (const [k, ids] of groups) {
      if (ids.length >= 3) {
        const exists = (await db.select().from(audienceIdeas).where(sql`${audienceIdeas.title} = ${k}`)) as unknown as Array<unknown>;
        if (!exists.length) {
          await db.insert(audienceIdeas).values({ id: generateEntityId("WIB"), title: k.slice(0, 80), evidence: ids.slice(0, 5) } as never);
        }
      }
    }
  } catch {}
  return inserted;
}

async function fetchYouTubeComments(videoId: string): Promise<Array<{ id: string; author: string; text: string }>> {
  try {
    const { google } = await import("googleapis");
    const { db: dbRef } = await import("@/db");
    const { socialAccounts, credentials } = await import("@/db/schema");
    const { decryptSecret } = await import("@/lib/crypto");
    const [acc] = (await dbRef.select().from(socialAccounts).where(eq(socialAccounts.platform, "youtube")).limit(1)) as unknown as Array<{ credentialRef: string | null }>;
    if (!acc?.credentialRef) return [];
    const [cred] = (await dbRef.select().from(credentials).where(eq(credentials.id, acc.credentialRef)).limit(1)) as unknown as Array<{ encryptedPayload: string }>;
    if (!cred) return [];
    const payload = JSON.parse(decryptSecret(cred.encryptedPayload)) as Record<string, unknown>;
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials(payload as never);
    const youtube = google.youtube({ version: "v3", auth });
    const res = await youtube.commentThreads.list({ part: ["snippet"], videoId, maxResults: 20, order: "relevance" });
    const items = (res.data.items ?? []) as Array<{ id?: string; snippet?: { topLevelComment?: { snippet?: { textDisplay?: string; authorDisplayName?: string } } } }>;
    return items.map((it) => ({ id: String(it.id ?? Math.random()), author: String(it.snippet?.topLevelComment?.snippet?.authorDisplayName ?? ""), text: String(it.snippet?.topLevelComment?.snippet?.textDisplay ?? "") })).filter((c) => c.text);
  } catch { return []; }
}

export async function generateDraftReplies(): Promise<number> {
  const pending = (await db.select().from(engagementComments).where(sql`${engagementComments.isSpam} = false`).limit(20)) as unknown as Array<{ commentId: string; text: string }>;
  let n = 0;
  for (const c of pending) {
    const exists = (await db.select().from(engagementDrafts).where(eq(engagementDrafts.commentId, c.commentId)).limit(1)) as unknown as Array<unknown>;
    if (exists.length) continue;
    // Simple template draft (real LLM would be here)
    const draft = `ممنون از نظرت! 🙏 ${c.text.slice(0, 40)}...`;
    await db.insert(engagementDrafts).values({ id: generateEntityId("WIB"), commentId: c.commentId, draftText: draft } as never);
    n++;
    if (n >= 5) break;
  }
  return n;
}

export async function listEngagement() {
  const comments = (await db.select().from(engagementComments).orderBy(desc(engagementComments.syncedAt)).limit(50)) as unknown as Array<typeof engagementComments.$inferSelect>;
  const drafts = (await db.select().from(engagementDrafts).orderBy(desc(engagementDrafts.createdAt)).limit(20)) as unknown as Array<typeof engagementDrafts.$inferSelect>;
  const ideas = (await db.select().from(audienceIdeas).orderBy(desc(audienceIdeas.createdAt)).limit(10)) as unknown as Array<typeof audienceIdeas.$inferSelect>;
  const spam = comments.filter((c) => c.isSpam);
  const clean = comments.filter((c) => !c.isSpam);
  return { comments: clean, spam, drafts, ideas };
}
