import { db } from "@/db";
import { content, shortsDrafts } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";
import { eq } from "drizzle-orm";

export async function createShortsDrafts(sourceContentId: string): Promise<Array<typeof shortsDrafts.$inferSelect>> {
  const [src] = await db.select().from(content).where(eq(content.id, sourceContentId)).limit(1);
  if (!src) throw new Error("محتوا یافت نشد.");
  const title = String((src as unknown as { title: string }).title ?? "بدون عنوان");
  // 3 windows: 0-30s, 30-60s, 60-90s with center-crop layout
  const layouts: Array<string> = ["center-crop", "blurred-canvas", "stacked-focus"];
  const drafts: Array<typeof shortsDrafts.$inferSelect> = [];
  for (let i = 0; i < 3; i++) {
    const id = generateEntityId("WIB");
    const [row] = await db
      .insert(shortsDrafts)
      .values({
        id,
        sourceContentId,
        title: `Short ${i + 1}: ${title.slice(0, 60)}`,
        startSec: i * 30,
        durationSec: 30,
        layout: layouts[i] ?? "center-crop",
        status: "draft",
      } as never)
      .returning();
    drafts.push(row as unknown as typeof shortsDrafts.$inferSelect);
  }
  return drafts;
}

export async function listShortsDrafts(sourceContentId: string) {
  const { desc } = await import("drizzle-orm");
  return (await db.select().from(shortsDrafts).where(eq(shortsDrafts.sourceContentId, sourceContentId)).orderBy(desc(shortsDrafts.createdAt))) as unknown as Array<typeof shortsDrafts.$inferSelect>;
}

export async function renderShortDraft(draftId: string): Promise<{ ok: boolean; message: string }> {
  const [d] = await db.select().from(shortsDrafts).where(eq(shortsDrafts.id, draftId)).limit(1);
  if (!d) throw new Error("پیش‌نویس یافت نشد.");
  // Local render placeholder: in Phase 2 we just mark as rendered
  // Real FFmpeg 9:16 rendering would happen here via src/lib/video/assembly
  await db.update(shortsDrafts).set({ status: "rendered" } as never).where(eq(shortsDrafts.id, draftId));
  return { ok: true, message: "رندر محلی انجام شد (placeholder — FFmpeg در فاز بعد)." };
}
