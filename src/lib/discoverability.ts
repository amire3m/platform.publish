import { db } from "@/db";
import { content, discoverabilityFindings, discoverabilityRuns } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";
import { eq } from "drizzle-orm";

export interface DiscoverabilityRule {
  id: string;
  severity: "info" | "warn" | "fail";
  message: string;
  engine: string;
}

const ENGINE_VERSION = "1.0.0";
const SCHEMA_VERSION = "1.0.0";

function rule(id: string, severity: DiscoverabilityRule["severity"], message: string): DiscoverabilityRule {
  return { id, severity, message, engine: "bundled" };
}

export function auditContent(contentRow: Record<string, unknown>): DiscoverabilityRule[] {
  const findings: DiscoverabilityRule[] = [];
  const title = String(contentRow.title ?? "");
  const desc = String(contentRow.description ?? "");
  const caption = String(contentRow.caption ?? "");
  const hashtags = (contentRow.hashtags ?? []) as string[];
  const platformTargets = (contentRow.platformTargets ?? contentRow.platform_targets ?? []) as unknown[];
  const tags = (contentRow.tags ?? []) as string[];

  // GEO: title length for search
  if (title.length < 10) findings.push(rule("GEO-001", "fail", "عنوان کوتاه است — برای جستجوی گوگل کم است."));
  else if (title.length > 70) findings.push(rule("GEO-002", "warn", "عنوان بیش از ۷۰ کاراکتر — در نتایج جستجو کوتاه می‌شود."));
  else findings.push(rule("GEO-003", "info", "عنوان از نظر طول مناسب است."));

  // AIO: description for AI Overviews
  if (desc.length < 100) findings.push(rule("AIO-001", "warn", "توضیحات کوتاه است — برای AI Overviews کافی نیست."));
  if (!desc.includes("؟") && !desc.includes("?") && desc.length > 50) findings.push(rule("AIO-002", "info", "افزودن یک سؤال طبیعی به توضیحات به AIO کمک می‌کند."));

  // AEO: answer engine
  if (hashtags.length === 0) findings.push(rule("AEO-001", "warn", "هشتگی ندارد — برای Answer Engine ضعیف است."));
  if (hashtags.length > 15) findings.push(rule("AEO-002", "warn", "هشتگ زیاد است (بیش از ۱۵) — اسپم به نظر می‌رسد."));

  // Web search: tags
  if (tags.length === 0) findings.push(rule("WEB-001", "warn", "تگی ندارد — برای جستجوی وب ضعیف است."));
  if (tags.length > 10) findings.push(rule("WEB-002", "info", "تگ‌ها کامل است."));

  // Thumbnail
  const thumb = (contentRow.thumbnailMessageId ?? contentRow.thumbnail_message_id) as number | null;
  if (!thumb) findings.push(rule("WEB-003", "warn", "کاور ندارد — CTR پایین می‌آید."));

  // Caption for social
  if (caption.length < 20) findings.push(rule("SOC-001", "warn", "کپشن کوتاه است."));

  // Platform targets
  if (platformTargets.length === 0) findings.push(rule("PUB-001", "fail", "مقصد انتشار انتخاب نشده."));

  return findings;
}

export async function runDiscoverabilityAudit(contentId: string): Promise<{ runId: string; findings: DiscoverabilityRule[] }> {
  const { db: dbRef } = await import("@/db");
  const [row] = await dbRef.select().from(content).where(eq(content.id, contentId)).limit(1);
  if (!row) throw new Error("محتوا یافت نشد.");
  const findings = auditContent(row as unknown as Record<string, unknown>);
  const runId = generateEntityId("WIB");
  const summary = {
    total: findings.length,
    fail: findings.filter((f) => f.severity === "fail").length,
    warn: findings.filter((f) => f.severity === "warn").length,
  };
  await db.insert(discoverabilityRuns).values({ id: runId, contentId, engineVersion: ENGINE_VERSION, schemaVersion: SCHEMA_VERSION, status: "done", summary } as never);
  for (const f of findings) {
    await db.insert(discoverabilityFindings).values({ id: generateEntityId("WIB"), runId, ruleId: f.id, severity: f.severity, message: f.message } as never);
  }
  return { runId, findings };
}

export async function getDiscoverabilityHistory(contentId: string) {
  const { desc } = await import("drizzle-orm");
  const runs = (await db.select().from(discoverabilityRuns).where(eq(discoverabilityRuns.contentId, contentId)).orderBy(desc(discoverabilityRuns.createdAt)).limit(5)) as unknown as Array<typeof discoverabilityRuns.$inferSelect>;
  const out: Array<{ run: typeof discoverabilityRuns.$inferSelect; findings: Array<typeof discoverabilityFindings.$inferSelect> }> = [];
  for (const r of runs) {
    const findings = (await db.select().from(discoverabilityFindings).where(eq(discoverabilityFindings.runId, r.id))) as unknown as Array<typeof discoverabilityFindings.$inferSelect>;
    out.push({ run: r, findings });
  }
  return out;
}

export async function dismissFinding(findingId: string, reason: string): Promise<void> {
  const { eq: eq2 } = await import("drizzle-orm");
  await db.update(discoverabilityFindings).set({ dismissed: true, dismissReason: reason } as never).where(eq2(discoverabilityFindings.id, findingId));
}
