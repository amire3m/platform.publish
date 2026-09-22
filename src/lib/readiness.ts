import { spawn } from "node:child_process";

export interface ReadinessCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  remediation?: string;
}

export interface ReadinessResult {
  status: "pass" | "fail" | "unknown";
  generatedAt: string;
  checks: ReadinessCheck[];
  summary: string;
}

function check(id: string, label: string, status: ReadinessCheck["status"], detail: string, remediation?: string): ReadinessCheck {
  return { id, label, status, detail, remediation };
}

async function canRunFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-version"]);
    let done = false;
    p.on("error", () => { if (!done) { done = true; resolve(false); } });
    p.on("close", (code) => { if (!done) { done = true; resolve(code === 0); } });
    setTimeout(() => { if (!done) { done = true; try { p.kill(); } catch {} resolve(false); } }, 4000);
  });
}

export async function runReadinessProbe(opts?: { includePaidMedia?: boolean }): Promise<ReadinessResult> {
  const checks: ReadinessCheck[] = [];

  // Node
  const major = Number(process.versions.node.split(".")[0]);
  checks.push(check("node", "Node.js", major >= 18 ? "ok" : "fail", `${process.versions.node}`, major < 18 ? "Node 18+ نصب کنید." : undefined));

  // Env
  const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  checks.push(check("google-oauth", "YouTube OAuth", hasGoogle ? "ok" : "warn", hasGoogle ? "GOOGLE_CLIENT_ID موجود است" : "پیکربندی نشده — انتشار یوتیوب در حالت آزمایشی می‌ماند", hasGoogle ? undefined : "GOOGLE_CLIENT_ID/SECRET را در .env بگذارید."));

  // FFmpeg
  const ffOk = await canRunFfmpeg().catch(() => false);
  checks.push(check("ffmpeg", "FFmpeg", ffOk ? "ok" : "warn", ffOk ? "در دسترس است" : "یافت نشد — مونتاژ محلی بدون آن انجام نمی‌شود", ffOk ? undefined : "ffmpeg را نصب کنید یا از بسته ffmpeg-static استفاده کنید."));

  // Telegram
  const hasTg = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_GROUP_ID);
  checks.push(check("telegram", "ربات تلگرام", hasTg ? "ok" : "fail", hasTg ? "توکن و گروه تنظیم شده" : "TELEGRAM_BOT_TOKEN/GROUP_ID خالی است", hasTg ? undefined : "توکن ربات را در .env تنظیم کنید."));

  // DB
  try {
    const { db } = await import("@/db");
    await db.execute("SELECT 1" as never);
    checks.push(check("db", "پایگاه داده", "ok", "اتصال برقرار است"));
  } catch (e) {
    checks.push(check("db", "پایگاه داده", "fail", `اتصال ناموفق: ${(e as Error).message.slice(0, 120)}`, "DATABASE_URL را بررسی کنید."));
  }

  // Pending uploads metadata
  try {
    const { db } = await import("@/db");
    const { content } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    const rows = (await db.select({ id: content.id, title: content.title, media: content.media, platformTargets: content.platformTargets }).from(content).where(sql`${content.status} IN ('scheduled','publishing')`).limit(20)) as unknown as Array<{ id: string; title: string; media: unknown[]; platformTargets: unknown[] }>;
    let bad = 0;
    for (const r of rows) {
      const media = (r.media ?? []) as Array<Record<string, unknown>>;
      const hasFile = media.some((m) => typeof m.telegram_file_id === "string" && String(m.telegram_file_id).length > 5);
      if (!hasFile) bad++;
    }
    if (rows.length === 0) checks.push(check("queue", "صف انتشار", "ok", "صفی در انتظار نیست"));
    else if (bad) checks.push(check("queue", "صف انتشار", "warn", `${bad} مورد بدون telegram_file_id`, "فایل‌ها را دوباره لینک کنید."));
    else checks.push(check("queue", "صف انتشار", "ok", `${rows.length} مورد — متادیتا سالم`));
  } catch {
    checks.push(check("queue", "صف انتشار", "warn", "بررسی صف ممکن نشد"));
  }

  const failCount = checks.filter((c) => c.status === "fail").length;
  const status: ReadinessResult["status"] = failCount > 0 ? "fail" : "pass";
  const summary = status === "pass" ? "آماده — می‌توانید تولید خودکار را فعال کنید." : `${failCount} مورد مسدودکننده — قبل از فعال‌سازی برطرف کنید.`;

  return { status, generatedAt: new Date().toISOString(), checks, summary };
}

export async function saveReadinessResult(result: ReadinessResult): Promise<void> {
  try {
    const { db } = await import("@/db");
    const { appSettings } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    // Ensure singleton row exists
    const [existing] = (await db.select().from(appSettings).limit(1)) as unknown as Array<Record<string, unknown>>;
    if (!existing) {
      await db.insert(appSettings).values({ id: 1, readinessLastRunAt: new Date(), readinessLastStatus: result.status, readinessLastResult: result as unknown as Record<string, unknown> } as never);
    } else {
      await db.update(appSettings).set({ readinessLastRunAt: new Date(), readinessLastStatus: result.status, readinessLastResult: result as unknown as Record<string, unknown>, updatedAt: new Date() } as never).where(eq(appSettings.id, 1));
    }
  } catch {}
}

export async function loadReadinessResult(): Promise<ReadinessResult | null> {
  try {
    const { db } = await import("@/db");
    const { appSettings } = await import("@/db/schema");
    const [row] = (await db.select().from(appSettings).limit(1)) as unknown as Array<{ readinessLastResult?: unknown; readinessLastStatus?: string }>;
    const r = row?.readinessLastResult as ReadinessResult | undefined;
    if (r && Array.isArray((r as ReadinessResult).checks)) return r as ReadinessResult;
    return null;
  } catch { return null; }
}
