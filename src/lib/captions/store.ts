import { eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { contentParts, contentProducts, partTranscripts } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";
import { ContentRoomRepositoryError } from "@/lib/content-room/repository";

export type TranscriptStatus = "queued" | "processing" | "ready" | "error";

export interface TranscriptRow {
  id: string;
  partId: string;
  language: string;
  fullText: string;
  durationSec: number | null;
  segments: Array<{ start: number; end: number; text: string }>;
  srtText: string;
  captions: { youtube: string; instagram: string } | null;
  sttModel: string | null;
  llmModel: string | null;
  status: TranscriptStatus;
  error: string | null;
  version: number;
}

function mapRow(r: Record<string, unknown>): TranscriptRow {
  return {
    id: r.id as string,
    partId: (r.partId as string) ?? (r.part_id as string),
    language: ((r.language as string) ?? "fa") as string,
    fullText: ((r.fullText as string) ?? (r.full_text as string) ?? "") as string,
    durationSec: ((r.durationSec as number | null) ?? (r.duration_sec as number | null) ?? null) as number | null,
    segments: ((r.segments as TranscriptRow["segments"]) ?? []) as TranscriptRow["segments"],
    srtText: ((r.srtText as string) ?? (r.srt_text as string) ?? "") as string,
    captions: ((r.captions as TranscriptRow["captions"]) ?? null) as TranscriptRow["captions"],
    sttModel: ((r.sttModel as string | null) ?? (r.stt_model as string | null) ?? null) as string | null,
    llmModel: ((r.llmModel as string | null) ?? (r.llm_model as string | null) ?? null) as string | null,
    status: ((r.status as TranscriptStatus) ?? "queued") as TranscriptStatus,
    error: ((r.error as string | null) ?? null) as string | null,
    version: (r.version as number) ?? 1,
  };
}

export async function getTranscriptByPart(partId: string): Promise<TranscriptRow | null> {
  const [row] = await db.select().from(partTranscripts).where(eq(partTranscripts.partId, partId)).limit(1);
  return row ? mapRow(row as unknown as Record<string, unknown>) : null;
}

export async function upsertQueued(partId: string): Promise<TranscriptRow> {
  const now = new Date();
  const [row] = await db
    .insert(partTranscripts)
    .values({
      id: generateEntityId("PTR"),
      partId,
      language: "fa",
      fullText: "",
      segments: [],
      srtText: "",
      captions: null,
      status: "queued",
      error: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    } as never)
    .onConflictDoUpdate({
      target: partTranscripts.partId,
      set: { status: "queued", error: null, updatedAt: now } as never,
    })
    .returning();
  if (!row) throw new ContentRoomRepositoryError("NOT_FOUND", "رکورد رونوشت یافت نشد.");
  return mapRow(row as unknown as Record<string, unknown>);
}

export async function setTranscriptStatus(partId: string, status: TranscriptStatus, error: string | null = null): Promise<void> {
  await db
    .update(partTranscripts)
    .set({ status, error, updatedAt: new Date() } as never)
    .where(eq(partTranscripts.partId, partId));
}

export async function saveTranscriptResult(
  partId: string,
  result: { text: string; durationSec: number; segments: TranscriptRow["segments"]; srt: string; model: string },
): Promise<void> {
  await db
    .update(partTranscripts)
    .set({
      fullText: result.text,
      durationSec: result.durationSec,
      segments: result.segments,
      srtText: result.srt,
      sttModel: result.model,
      status: "ready",
      error: null,
      version: sql`${partTranscripts.version} + 1`,
      updatedAt: new Date(),
    } as never)
    .where(eq(partTranscripts.partId, partId));
}

export async function saveEditedText(partId: string, text: string, srt: string, expectedVersion: number): Promise<TranscriptRow> {
  const existing = await getTranscriptByPart(partId);
  if (!existing) throw new ContentRoomRepositoryError("NOT_FOUND", "رونوشت یافت نشد.");
  if (existing.version !== expectedVersion) throw new ContentRoomRepositoryError("VERSION_CONFLICT", "نسخه قدیمی است.");
  const [row] = await db
    .update(partTranscripts)
    .set({ fullText: text, srtText: srt, version: existing.version + 1, updatedAt: new Date() } as never)
    .where(eq(partTranscripts.partId, partId))
    .returning();
  if (!row) throw new ContentRoomRepositoryError("NOT_FOUND", "رونوشت یافت نشد.");
  return mapRow(row as unknown as Record<string, unknown>);
}

export async function saveCaptions(
  partId: string,
  captions: { youtube: string; instagram: string },
  model: string,
): Promise<void> {
  await db
    .update(partTranscripts)
    .set({
      captions,
      llmModel: model,
      version: sql`${partTranscripts.version} + 1`,
      updatedAt: new Date(),
    } as never)
    .where(eq(partTranscripts.partId, partId));
}

export async function dailyMinutesUsed(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${partTranscripts.durationSec}), 0)` })
    .from(partTranscripts)
    .where(gte(partTranscripts.createdAt, start));
  const total = Number((row as unknown as { total: number | string } | undefined)?.total ?? 0);
  return total / 60;
}

export async function getPartWithProduct(partId: string): Promise<{
  part: { id: string; productId: string; partNumber: number; fileRef: string | null };
  product: { id: string; title: string; channel: string };
} | null> {
  const [partRow] = await db.select().from(contentParts).where(eq(contentParts.id, partId)).limit(1);
  if (!partRow) return null;
  const part = partRow as unknown as { id: string; productId: string; product_id?: string; partNumber: number; part_number?: number; fileRef?: string | null; file_ref?: string | null };
  const productId = part.productId ?? part.product_id ?? "";
  const [productRow] = await db.select().from(contentProducts).where(eq(contentProducts.id, productId)).limit(1);
  if (!productRow) return null;
  const product = productRow as unknown as { id: string; title: string; channel: string };
  return {
    part: {
      id: part.id,
      productId,
      partNumber: part.partNumber ?? part.part_number ?? 0,
      fileRef: part.fileRef ?? part.file_ref ?? null,
    },
    product: { id: product.id, title: product.title, channel: product.channel },
  };
}
