import { parsePersistedTargets, targetForWorkflowPublication } from "@/lib/content-targets";
import { reflectTargetState } from "./target-adapter";
import { generateEntityId } from "@/lib/ids";

export interface ReconciliationDeps {
  listPublicationsPaged?: (offset: number, limit: number) => Promise<Record<string, unknown>[]>;
  getDeliverable?: (id: string) => Promise<Record<string, unknown> | null>;
  getContent?: (id: string) => Promise<Record<string, unknown> | null>;
  getPublication?: (id: string) => Promise<Record<string, unknown> | null>;
  transactUpdatePublication?: (id: string, expectedVersion: number, patch: Record<string, unknown>, event: Record<string, unknown>) => Promise<Record<string, unknown>>;
  createEvent?: (event: Record<string, unknown>) => Promise<void>;
}

async function defaultListPaged(offset: number, limit: number): Promise<Record<string, unknown>[]> {
  const { db } = await import("@/db");
  const { workflowPublications } = await import("@/db/schema");
  const rows = await db.select().from(workflowPublications).limit(limit).offset(offset);
  return rows as unknown as Record<string, unknown>[];
}

async function defaultGetDeliverable(id: string) {
  const { db } = await import("@/db");
  const { workflowDeliverables } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(workflowDeliverables).where(eq(workflowDeliverables.id, id)).limit(1);
  return (row as unknown as Record<string, unknown>) ?? null;
}

async function defaultGetContent(id: string) {
  const { db } = await import("@/db");
  const { content } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(content).where(eq(content.id, id)).limit(1);
  return (row as unknown as Record<string, unknown>) ?? null;
}

export async function reconcileWorkflowTargets(deps?: ReconciliationDeps): Promise<{ reconciled: number; warnings: number; processed: number }> {
  const listPaged = deps?.listPublicationsPaged ?? defaultListPaged;
  const getDeliverable = deps?.getDeliverable ?? defaultGetDeliverable;
  const getContent = deps?.getContent ?? defaultGetContent;

  const PAGE = 100;
  let offset = 0;
  let reconciled = 0;
  let warnings = 0;
  let processed = 0;

  while (true) {
    const pubs: Record<string, unknown>[] = await listPaged(offset, PAGE);
    if (pubs.length === 0) break;

    for (const pub of pubs) {
      processed++;
      const deliverableId = (pub.deliverableId as string) ?? (pub.deliverable_id as string);
      if (!deliverableId) continue;
      try {
        const deliverable = await getDeliverable(deliverableId);
        if (!deliverable) continue;
        const contentId = (deliverable.contentId as string) ?? (deliverable.content_id as string) ?? null;
        if (!contentId) continue;
        const contentRow = await getContent(contentId);
        if (!contentRow) {
          warnings++;
          const warnEvent: Record<string, unknown> = {
            id: generateEntityId("WEV"),
            entityType: "workflow_publication",
            entityId: pub.id as string,
            action: "reconciliation_missing_content",
            before: { contentId },
            after: null,
            actorUserId: null,
            source: "automatic",
            reason: "content_not_found",
            createdAt: new Date(),
          };
          if (deps?.createEvent) await deps.createEvent(warnEvent);
          else {
            try {
              const { db } = await import("@/db");
              const { workflowEvents } = await import("@/db/schema");
              await db.insert(workflowEvents).values(warnEvent as never);
            } catch {}
          }
          continue;
        }
        const rawTargets = (contentRow.platformTargets as unknown[]) ?? (contentRow.platform_targets as unknown[]) ?? [];
        const targets = parsePersistedTargets(rawTargets);
        const keyed = targetForWorkflowPublication(targets, pub.id as string);
        if (!keyed) {
          warnings++;
          const warnEvent: Record<string, unknown> = {
            id: generateEntityId("WEV"),
            entityType: "workflow_publication",
            entityId: pub.id as string,
            action: "reconciliation_missing_target",
            before: { publicationId: pub.id },
            after: null,
            actorUserId: null,
            source: "automatic",
            reason: "missing_keyed_target",
            createdAt: new Date(),
          };
          if (deps?.createEvent) await deps.createEvent(warnEvent);
          else {
            try {
              const { db } = await import("@/db");
              const { workflowEvents } = await import("@/db/schema");
              await db.insert(workflowEvents).values(warnEvent as never);
            } catch {}
          }
          // Do not guess another target
          continue;
        }
        const productionStatus = (deliverable.productionStatus as string) ?? (deliverable.production_status as string) ?? "not_started";
        const beforeStatus = pub.status as string;
        const result = await reflectTargetState(
          { publicationId: pub.id as string, target: keyed, productionStatus, publication: pub },
          deps as never,
        );
        if (result && (result.status as string) !== beforeStatus) {
          reconciled++;
        } else if (result) {
          // also count if external fields changed but status same? For now rely on status diff, but reflect already handled idempotency
        }
      } catch (err) {
        console.error("[reconciliation] failed for", pub.id, (err as Error).message);
        // idempotent: continue to next
      }
    }

    if (pubs.length < PAGE) break;
    offset += PAGE;
  }

  return { reconciled, warnings, processed };
}
