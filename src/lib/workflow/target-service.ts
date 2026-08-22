import { eq } from "drizzle-orm";
import { content, workflowPublications, workflowDeliverables } from "@/db/schema";
import { parsePersistedTargets, targetForWorkflowPublication, type PersistedPlatformTarget } from "@/lib/content-targets";
import { formatJalaliSlash } from "@/lib/date/jalali";
import type { updateContentRecord as UpdateContentRecordType } from "@/lib/telegram/tgdb";

export class WorkflowTargetError extends Error {
  constructor(
    public code: "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_TRANSITION" | "PRODUCTION_NOT_READY" | "ACCOUNT_FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "WorkflowTargetError";
  }
}

export interface TargetServiceDeps {
  getPublication?: (id: string) => Promise<Record<string, unknown> | null>;
  getDeliverable?: (id: string) => Promise<Record<string, unknown> | null>;
  getContent?: (id: string) => Promise<Record<string, unknown> | null>;
  getUser?: (id: string) => Promise<Record<string, unknown> | null>;
  updateContentRecord?: typeof UpdateContentRecordType;
  transactUpdatePublication?: (
    id: string,
    expectedVersion: number,
    patch: Record<string, unknown>,
    event?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  updateDeliverableContentId?: (deliverableId: string, contentId: string | null) => Promise<void>;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function deriveContentSchedule(targets: PersistedPlatformTarget[]): {
  scheduledAtUtc: Date | null;
  scheduledAtJalali: string | null;
  status: string;
} {
  const nonTerminal = targets.filter(
    (t) => t.publish_at_utc && !["published", "failed", "cancelled"].includes((t.status as string) ?? ""),
  );
  if (nonTerminal.length === 0) {
    // if no pending schedules, content status depends on other targets? For now return null
    return { scheduledAtUtc: null, scheduledAtJalali: null, status: "draft" };
  }
  const sorted = [...nonTerminal].sort(
    (a, b) => new Date(a.publish_at_utc as string).getTime() - new Date(b.publish_at_utc as string).getTime(),
  );
  const earliest = sorted[0];
  return {
    scheduledAtUtc: new Date(earliest.publish_at_utc as string),
    scheduledAtJalali: (earliest.publish_at_jalali as string) ?? null,
    status: "scheduled",
  };
}

async function getDb() {
  const { db } = await import("@/db");
  return db;
}

async function getUpdateContentRecord(): Promise<typeof UpdateContentRecordType> {
  const { updateContentRecord } = await import("@/lib/telegram/tgdb");
  return updateContentRecord;
}

async function loadPublication(publicationId: string, deps?: TargetServiceDeps) {
  if (deps?.getPublication) return deps.getPublication(publicationId);
  const db = await getDb();
  const [row] = await db.select().from(workflowPublications).where(eq(workflowPublications.id, publicationId)).limit(1);
  return (row as unknown as Record<string, unknown>) ?? null;
}

async function loadDeliverable(deliverableId: string, deps?: TargetServiceDeps) {
  if (deps?.getDeliverable) return deps.getDeliverable(deliverableId);
  const db = await getDb();
  const [row] = await db.select().from(workflowDeliverables).where(eq(workflowDeliverables.id, deliverableId)).limit(1);
  return (row as unknown as Record<string, unknown>) ?? null;
}

async function loadContent(contentId: string, deps?: TargetServiceDeps) {
  if (deps?.getContent) return deps.getContent(contentId);
  const db = await getDb();
  const [row] = await db.select().from(content).where(eq(content.id, contentId)).limit(1);
  return (row as unknown as Record<string, unknown>) ?? null;
}

async function mirrorPublication(
  publicationId: string,
  expectedVersion: number,
  patch: Record<string, unknown>,
  deps?: TargetServiceDeps,
) {
  if (deps?.transactUpdatePublication) {
    return deps.transactUpdatePublication(publicationId, expectedVersion, patch, {} as Record<string, unknown>);
  }
  const db = await getDb();
  // default: direct db update with version check
  const [existing] = await db.select().from(workflowPublications).where(eq(workflowPublications.id, publicationId)).limit(1);
  if (!existing) throw new WorkflowTargetError("NOT_FOUND", "انتشار یافت نشد.");
  if ((existing as unknown as Record<string, unknown>).version !== expectedVersion)
    throw new WorkflowTargetError("VERSION_CONFLICT", "نسخه قدیمی است.");
  const [updated] = await db
    .update(workflowPublications)
    .set({
      ...patch,
      version: expectedVersion + 1,
      updatedAt: new Date(),
    } as never)
    .where(eq(workflowPublications.id, publicationId))
    .returning();
  return updated as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public APIs
// ---------------------------------------------------------------------------

export async function linkPublicationTarget(
  input: { publicationId: string; contentId: string; actorUserId: string; expectedVersion: number },
  deps?: TargetServiceDeps,
): Promise<{ content: Record<string, unknown>; publication: Record<string, unknown> }> {
  const pub = (await loadPublication(input.publicationId, deps)) as Record<string, unknown> | null;
  if (!pub) throw new WorkflowTargetError("NOT_FOUND", "انتشار یافت نشد.");

  const deliverableId = pub.deliverableId as string ?? (pub.deliverable_id as string);
  const deliverable = (await loadDeliverable(deliverableId, deps)) as Record<string, unknown> | null;
  if (!deliverable) throw new WorkflowTargetError("NOT_FOUND", "خروجی یافت نشد.");

  // account scope check (if publication has account, verify actor can access)
  if (pub.socialAccountId ?? (pub as Record<string, unknown>).social_account_id) {
    const accountId = (pub.socialAccountId as string) ?? (pub.social_account_id as string);
    if (deps?.getUser) {
      const user = await deps.getUser(input.actorUserId);
      const allowed = (user?.allowedAccountIds as string[]) ?? (user?.allowed_account_ids as string[]) ?? [];
      if (accountId && !allowed.includes(accountId) && (user?.role as string) !== "manager" && (user?.role as string) !== "owner") {
        throw new WorkflowTargetError("ACCOUNT_FORBIDDEN", "دسترسی به حساب مقصد مجاز نیست.");
      }
    }
  }

  const contentRow = (await loadContent(input.contentId, deps)) as Record<string, unknown> | null;
  if (!contentRow) throw new WorkflowTargetError("NOT_FOUND", "محتوا یافت نشد.");

  const rawTargets = (contentRow.platformTargets as unknown[]) ?? (contentRow.platform_targets as unknown[]) ?? [];
  const targets = parsePersistedTargets(rawTargets);

  const existing = targetForWorkflowPublication(targets, input.publicationId);
  let updatedTargets: PersistedPlatformTarget[];
  if (existing) {
    // update existing keyed target to ensure platform/account matches publication
    updatedTargets = targets.map((t) =>
      t.workflow_publication_id === input.publicationId
        ? {
            ...t,
            platform: (pub.platform as string) ?? t.platform,
            account_id: ((pub.socialAccountId as string) ?? (pub.social_account_id as string) ?? t.account_id) as string,
          }
        : t,
    );
  } else {
    const newTarget: PersistedPlatformTarget = {
      platform: (pub.platform as string) ?? "youtube",
      account_id: ((pub.socialAccountId as string) ?? (pub.social_account_id as string) ?? "") as string,
      content_type: "post",
      status: "approved",
      publish_at_utc: null,
      publish_at_jalali: null,
      fields: {},
      attempts: 0,
      workflow_publication_id: input.publicationId,
    };
    updatedTargets = [...targets, newTarget];
  }

  const derived = deriveContentSchedule(updatedTargets);
  const updateFn = deps?.updateContentRecord ?? (await getUpdateContentRecord());
  const updatedContent = await updateFn(input.contentId, {
    platformTargets: updatedTargets,
    scheduledAtUtc: derived.scheduledAtUtc,
    scheduledAtJalali: derived.scheduledAtJalali,
    // do not force status change on link; keep existing unless schedule present
    ...(derived.scheduledAtUtc ? { status: "scheduled" } : {}),
  } as never);

  // Update deliverable.contentId if not already set
  const currentContentId = (deliverable.contentId as string) ?? (deliverable.content_id as string) ?? null;
  if (!currentContentId && deps?.updateDeliverableContentId) {
    await deps.updateDeliverableContentId(deliverableId, input.contentId);
  } else if (!currentContentId) {
    const db = await getDb();
    await db
      .update(workflowDeliverables)
      .set({ contentId: input.contentId } as never)
      .where(eq(workflowDeliverables.id, deliverableId));
  }

  // No status change for publication on link; just return
  return { content: updatedContent as unknown as Record<string, unknown>, publication: pub };
}

export async function detachPublicationTarget(
  input: { publicationId: string; actorUserId: string; expectedVersion: number },
  deps?: TargetServiceDeps,
): Promise<{ content: Record<string, unknown>; publication: Record<string, unknown> }> {
  const pub = (await loadPublication(input.publicationId, deps)) as Record<string, unknown> | null;
  if (!pub) throw new WorkflowTargetError("NOT_FOUND", "انتشار یافت نشد.");
  const status = (pub.status as string) ?? "";
  if (status === "publishing") throw new WorkflowTargetError("INVALID_TRANSITION", "انتشار در حال انجام است؛ ابتدا لغو کنید.");
  if (status === "scheduled") throw new WorkflowTargetError("INVALID_TRANSITION", "ابتدا زمان‌بندی را لغو کنید.");
  if ((pub.scheduledAt as unknown) ?? (pub.scheduled_at as unknown)) {
    throw new WorkflowTargetError("INVALID_TRANSITION", "ابتدا زمان‌بندی را لغو کنید.");
  }

  const deliverableId = (pub.deliverableId as string) ?? (pub.deliverable_id as string);
  const deliverable = (await loadDeliverable(deliverableId, deps)) as Record<string, unknown> | null;
  if (!deliverable) throw new WorkflowTargetError("NOT_FOUND", "خروجی یافت نشد.");
  const contentId = (deliverable.contentId as string) ?? (deliverable.content_id as string) ?? null;
  if (!contentId) throw new WorkflowTargetError("NOT_FOUND", "محتوای متصل یافت نشد.");

  const contentRow = (await loadContent(contentId, deps)) as Record<string, unknown> | null;
  if (!contentRow) throw new WorkflowTargetError("NOT_FOUND", "محتوا یافت نشد.");

  const rawTargets = (contentRow.platformTargets as unknown[]) ?? (contentRow.platform_targets as unknown[]) ?? [];
  const targets = parsePersistedTargets(rawTargets);
  const existing = targetForWorkflowPublication(targets, input.publicationId);
  if (!existing) throw new WorkflowTargetError("NOT_FOUND", "target متصل یافت نشد.");

  const updatedTargets = targets.filter((t) => t.workflow_publication_id !== input.publicationId);
  const derived = deriveContentSchedule(updatedTargets);

  const updateFn = deps?.updateContentRecord ?? (await getUpdateContentRecord());
  const updatedContent = await updateFn(contentId, {
    platformTargets: updatedTargets,
    scheduledAtUtc: derived.scheduledAtUtc,
    scheduledAtJalali: derived.scheduledAtJalali,
    status: derived.scheduledAtUtc ? "scheduled" : "draft",
  } as never);

  // Mirror: publication stays as is (maybe ready/waiting), no schedule
  // Optionally clear deliverable.contentId if this was the linked publication and no other targets? Keep for now.

  return { content: updatedContent as unknown as Record<string, unknown>, publication: pub };
}

export async function schedulePublicationTarget(
  input: {
    publicationId: string;
    scheduledAtUtc: string;
    scheduledAtJalali?: string | null;
    actorUserId: string;
    expectedVersion: number;
  },
  deps?: TargetServiceDeps,
): Promise<{ content: Record<string, unknown>; publication: Record<string, unknown> }> {
  const pub = (await loadPublication(input.publicationId, deps)) as Record<string, unknown> | null;
  if (!pub) throw new WorkflowTargetError("NOT_FOUND", "انتشار یافت نشد.");
  if ((pub.version as number) !== undefined && (pub.version as number) !== input.expectedVersion) {
    throw new WorkflowTargetError("VERSION_CONFLICT", "نسخه قدیمی است.");
  }

  const deliverableId = (pub.deliverableId as string) ?? (pub.deliverable_id as string);
  const deliverable = (await loadDeliverable(deliverableId, deps)) as Record<string, unknown> | null;
  if (!deliverable) throw new WorkflowTargetError("NOT_FOUND", "خروجی یافت نشد.");

  const productionStatus = (deliverable.productionStatus as string) ?? (deliverable.production_status as string) ?? "";
  if (productionStatus !== "ready") {
    throw new WorkflowTargetError("PRODUCTION_NOT_READY", "تولید هنوز آماده انتشار نیست.");
  }

  // Account scope check
  const accountId = (pub.socialAccountId as string) ?? (pub.social_account_id as string) ?? null;
  if (accountId && deps?.getUser) {
    const user = await deps.getUser(input.actorUserId);
    const allowed = (user?.allowedAccountIds as string[]) ?? (user?.allowed_account_ids as string[]) ?? [];
    const role = (user?.role as string) ?? "";
    if (!allowed.includes(accountId) && role !== "manager" && role !== "owner") {
      throw new WorkflowTargetError("ACCOUNT_FORBIDDEN", "دسترسی به حساب مقصد مجاز نیست.");
    }
  }

  const contentId = (deliverable.contentId as string) ?? (deliverable.content_id as string) ?? null;
  if (!contentId) throw new WorkflowTargetError("NOT_FOUND", "محتوا به خروجی متصل نیست.");

  const contentRow = (await loadContent(contentId, deps)) as Record<string, unknown> | null;
  if (!contentRow) throw new WorkflowTargetError("NOT_FOUND", "محتوا یافت نشد.");

  const rawTargets = (contentRow.platformTargets as unknown[]) ?? (contentRow.platform_targets as unknown[]) ?? [];
  const targets = parsePersistedTargets(rawTargets);
  const keyed = targetForWorkflowPublication(targets, input.publicationId);
  if (!keyed) throw new WorkflowTargetError("NOT_FOUND", "target کلیددار یافت نشد.");

  const jalali = input.scheduledAtJalali ?? formatJalaliSlash(input.scheduledAtUtc);

  const updatedTargets: PersistedPlatformTarget[] = targets.map((t) =>
    t.workflow_publication_id === input.publicationId
      ? {
          ...t,
          publish_at_utc: input.scheduledAtUtc,
          publish_at_jalali: jalali,
          status: "scheduled",
        }
      : t,
  );

  const derived = deriveContentSchedule(updatedTargets);

  const updateFn = deps?.updateContentRecord ?? (await getUpdateContentRecord());
  const updatedContent = await updateFn(contentId, {
    platformTargets: updatedTargets,
    scheduledAtUtc: derived.scheduledAtUtc,
    scheduledAtJalali: derived.scheduledAtJalali,
    status: "scheduled",
  } as never);

  // Mirror workflow state after Telegram-first success
  const publicationPatch: Record<string, unknown> = {
    scheduledAt: new Date(input.scheduledAtUtc),
    status: "scheduled",
    updatedBy: input.actorUserId,
  };

  const updatedPub = await mirrorPublication(input.publicationId, input.expectedVersion, publicationPatch, deps);

  return {
    content: updatedContent as unknown as Record<string, unknown>,
    publication: updatedPub as unknown as Record<string, unknown>,
  };
}

export async function cancelPublicationSchedule(
  input: { publicationId: string; actorUserId: string; expectedVersion: number },
  deps?: TargetServiceDeps,
): Promise<{ content: Record<string, unknown>; publication: Record<string, unknown> }> {
  const pub = (await loadPublication(input.publicationId, deps)) as Record<string, unknown> | null;
  if (!pub) throw new WorkflowTargetError("NOT_FOUND", "انتشار یافت نشد.");
  if ((pub.version as number) !== undefined && (pub.version as number) !== input.expectedVersion) {
    throw new WorkflowTargetError("VERSION_CONFLICT", "نسخه قدیمی است.");
  }
  const status = (pub.status as string) ?? "";
  if (status !== "scheduled") throw new WorkflowTargetError("INVALID_TRANSITION", "فقط انتشار زمان‌بندی‌شده قابل لغو است.");

  const deliverableId = (pub.deliverableId as string) ?? (pub.deliverable_id as string);
  const deliverable = (await loadDeliverable(deliverableId, deps)) as Record<string, unknown> | null;
  if (!deliverable) throw new WorkflowTargetError("NOT_FOUND", "خروجی یافت نشد.");

  const contentId = (deliverable.contentId as string) ?? (deliverable.content_id as string) ?? null;
  if (!contentId) throw new WorkflowTargetError("NOT_FOUND", "محتوا به خروجی متصل نیست.");

  const contentRow = (await loadContent(contentId, deps)) as Record<string, unknown> | null;
  if (!contentRow) throw new WorkflowTargetError("NOT_FOUND", "محتوا یافت نشد.");

  const rawTargets = (contentRow.platformTargets as unknown[]) ?? (contentRow.platform_targets as unknown[]) ?? [];
  const targets = parsePersistedTargets(rawTargets);
  const keyed = targetForWorkflowPublication(targets, input.publicationId);
  if (!keyed) throw new WorkflowTargetError("NOT_FOUND", "target کلیددار یافت نشد.");

  const updatedTargets: PersistedPlatformTarget[] = targets.map((t) =>
    t.workflow_publication_id === input.publicationId
      ? {
          ...t,
          publish_at_utc: null,
          publish_at_jalali: null,
          status: "approved",
        }
      : t,
  );

  const derived = deriveContentSchedule(updatedTargets);

  const updateFn = deps?.updateContentRecord ?? (await getUpdateContentRecord());
  const updatedContent = await updateFn(contentId, {
    platformTargets: updatedTargets,
    scheduledAtUtc: derived.scheduledAtUtc,
    scheduledAtJalali: derived.scheduledAtJalali,
    status: derived.scheduledAtUtc ? "scheduled" : "approved",
  } as never);

  const publicationPatch: Record<string, unknown> = {
    scheduledAt: null,
    status: "ready",
    updatedBy: input.actorUserId,
  };

  const updatedPub = await mirrorPublication(input.publicationId, input.expectedVersion, publicationPatch, deps);

  return {
    content: updatedContent as unknown as Record<string, unknown>,
    publication: updatedPub as unknown as Record<string, unknown>,
  };
}
