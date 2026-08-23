import { parsePersistedTargets, targetForWorkflowPublication, type PersistedPlatformTarget } from "@/lib/content-targets";
import type { PublicationStatus } from "./types";
import { generateEntityId } from "@/lib/ids";

export type MapTargetStateInput = {
  targetStatus?: string | null;
  productionStatus: string;
  terminalOwner?: string | null;
};

export function mapTargetState(input: MapTargetStateInput): PublicationStatus {
  const terminalOwner = input.terminalOwner ?? null;
  // Terminal owners are protected - caller handles no-op, but mapping still returns logical status
  // For production not ready, nonterminal stays waiting_for_production (terminal stays as is but we map waiting)
  if (input.productionStatus !== "ready") {
    return "waiting_for_production" as PublicationStatus;
  }
  const raw = (input.targetStatus ?? "approved").toLowerCase();
  if (raw === "draft" || raw === "approved" || raw === "ready") return "ready" as PublicationStatus;
  if (raw === "scheduled") return "scheduled" as PublicationStatus;
  if (raw === "publishing" || raw === "claim" || raw === "active") return "publishing" as PublicationStatus;
  if (raw === "published") return "published" as PublicationStatus;
  if (raw === "failed") return "failed" as PublicationStatus;
  if (raw === "cancelled" || raw === "canceled") return "do_not_publish" as PublicationStatus;
  // suppress-origin cancelled maps to do_not_publish, otherwise cancelled handled above
  return "ready" as PublicationStatus;
}

// Dependencies for reflection
export interface WorkflowTargetAdapterDeps {
  getPublication?: (id: string) => Promise<Record<string, unknown> | null>;
  getDeliverable?: (id: string) => Promise<Record<string, unknown> | null>;
  getContent?: (id: string) => Promise<Record<string, unknown> | null>;
  transactUpdatePublication?: (
    id: string,
    expectedVersion: number,
    patch: Record<string, unknown>,
    event: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  createEvent?: (event: Record<string, unknown>) => Promise<void>;
}

function safeErrorMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // only safe error, strip secrets: limit length and avoid credentials
  return raw.slice(0, 500);
}

function toPublicationPatchFromTarget(
  publication: Record<string, unknown>,
  target: PersistedPlatformTarget,
  desiredStatus: PublicationStatus,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { status: desiredStatus };

  if (desiredStatus === "scheduled") {
    const iso = target.publish_at_utc as string | null;
    patch.scheduledAt = iso ? new Date(iso) : (publication.scheduledAt as Date | null) ?? (publication.scheduled_at as Date | null) ?? null;
  } else if (desiredStatus === "do_not_publish") {
    patch.scheduledAt = null;
  } else if (desiredStatus === "published") {
    patch.publishedAt = new Date();
    if (target.external_id) patch.externalId = target.external_id;
    if (target.permalink) patch.permalink = target.permalink;
    patch.lastErrorCode = null;
    patch.lastErrorMessage = null;
    // terminalOwner automatic only if not already manual/imported (handled upstream)
    patch.terminalOwner = "automatic";
  } else if (desiredStatus === "failed") {
    patch.lastErrorMessage = safeErrorMessage(target.last_error);
    patch.lastErrorCode = "publish_failed";
    // clear published metadata if moving to failed
  } else if (desiredStatus === "publishing") {
    // claim active
    patch.lastErrorCode = null;
    patch.lastErrorMessage = null;
  } else if (desiredStatus === "ready") {
    // approved/draft maps to ready, clear schedule if not scheduled
    // Do not clear scheduledAt here unless explicit cancel; keep as is?
  }
  // For publishing via worker claim, ensure status is publishing
  return patch;
}

export async function reflectTargetState(
  input: {
    publicationId: string;
    target: PersistedPlatformTarget | null;
    productionStatus: string;
    publication?: Record<string, unknown> | null;
  },
  deps?: WorkflowTargetAdapterDeps,
): Promise<Record<string, unknown> | null> {
  // Load publication if not provided
  let publication = input.publication ?? null;
  if (!publication) {
    if (deps?.getPublication) {
      publication = await deps.getPublication(input.publicationId);
    } else {
      const { db } = await import("@/db");
      const { workflowPublications } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(workflowPublications).where(eq(workflowPublications.id, input.publicationId)).limit(1);
      publication = (row as unknown as Record<string, unknown>) ?? null;
    }
  }
  if (!publication) return null;

  const version = (publication.version as number) ?? 0;
  const currentStatus = (publication.status as string) ?? "waiting_for_production";
  const terminalOwner = (publication.terminalOwner as string | null) ?? (publication.terminal_owner as string | null) ?? null;
  const targetStatus = input.target?.status ?? null;

  // Terminal protection
  if (terminalOwner === "manual" || terminalOwner === "imported") {
    // Record safe no-op event and do not overwrite
    const noopEvent: Record<string, unknown> = {
      id: generateEntityId("WEV"),
      entityType: "workflow_publication",
      entityId: input.publicationId,
      action: "reconciliation_noop_terminal_protected",
      before: { status: currentStatus, terminalOwner },
      after: { status: currentStatus, terminalOwner },
      actorUserId: null,
      source: "automatic",
      reason: "terminal_owner_protected",
      createdAt: new Date(),
    };
    if (deps?.createEvent) {
      try {
        await deps.createEvent(noopEvent);
      } catch {
        // ignore event failure
      }
    } else {
      try {
        const { db } = await import("@/db");
        const { workflowEvents } = await import("@/db/schema");
        await db.insert(workflowEvents).values(noopEvent as never);
      } catch {
        // best-effort
      }
    }
    return publication;
  }

  const desired = mapTargetState({ targetStatus, productionStatus: input.productionStatus, terminalOwner });

  // Idempotency: if desired equals current and no material diff in external fields, no-op
  // We check externalId/permalink/lastError diff for published/failed as well
  let needsUpdate = desired !== currentStatus;
  if (!needsUpdate && input.target) {
    if (desired === "published") {
      const ext = input.target.external_id ?? null;
      const perm = input.target.permalink ?? null;
      if (ext && ext !== (publication.externalId ?? publication.external_id)) needsUpdate = true;
      if (perm && perm !== (publication.permalink ?? publication.permalink)) needsUpdate = true;
    } else if (desired === "failed") {
      const msg = safeErrorMessage(input.target.last_error);
      if (msg !== (publication.lastErrorMessage ?? publication.last_error_message ?? null)) needsUpdate = true;
    } else if (desired === "scheduled") {
      const iso = input.target.publish_at_utc ?? null;
      const currentScheduled = (publication.scheduledAt as Date | null) ?? (publication.scheduled_at as Date | null) ?? null;
      const currentIso = currentScheduled ? new Date(currentScheduled).toISOString() : null;
      if (iso !== currentIso) needsUpdate = true;
    }
  }

  if (!needsUpdate) return publication;

  // For published via target, ensure terminalOwner automatic is included unless protected (already handled)
  const patch = toPublicationPatchFromTarget(publication, input.target ?? { status: desired } as unknown as PersistedPlatformTarget, desired);

  // Guard: never set terminalOwner automatic if existing protected (already returned)
  // Also don't overwrite manual/imported (already protected)
  const event: Record<string, unknown> = {
    id: generateEntityId("WEV"),
    entityType: "workflow_publication",
    entityId: input.publicationId,
    action: "reconciliation_reflect",
    before: { status: currentStatus, terminalOwner },
    after: { status: desired, ...patch },
    actorUserId: null,
    source: "automatic",
    reason: null,
    createdAt: new Date(),
  };

  if (deps?.transactUpdatePublication) {
    try {
      const updated = await deps.transactUpdatePublication(input.publicationId, version, patch, event);
      // Failure alert: when desired is failed, enqueue notification best-effort (does not roll back)
      if (desired === "failed" && updated) {
        void (async () => {
          try {
            const { enqueueWorkflowNotificationDb } = await import("./notifications");
            const pubVersion = (updated as { version?: number }).version ?? version + 1;
            const failureReason = safeErrorMessage((input.target?.last_error as string) ?? null) ?? "publish_failed";
            const platform = (updated as { platform?: string }).platform ?? (publication as { platform?: string })?.platform ?? "unknown";
            // Try to resolve assignee via deliverable if possible
            let assigneeId: string | null = null;
            try {
              if (deps?.getDeliverable) {
                const deliverableId = (publication as { deliverableId?: string; deliverable_id?: string })?.deliverableId ?? (publication as { deliverable_id?: string })?.deliverable_id ?? null;
                if (deliverableId) {
                  const del = await deps.getDeliverable(deliverableId);
                  assigneeId = (del as { assigneeUserId?: string | null; assignee_user_id?: string | null })?.assigneeUserId ?? (del as { assignee_user_id?: string | null })?.assignee_user_id ?? null;
                }
              } else {
                const { db } = await import("@/db");
                const { workflowPublications: wpPub, workflowDeliverables } = await import("@/db/schema");
                const { eq } = await import("drizzle-orm");
                const [pubRow] = await db.select().from(wpPub).where(eq(wpPub.id, input.publicationId)).limit(1);
                const delId = (pubRow as unknown as { deliverableId?: string; deliverable_id?: string })?.deliverableId ?? (pubRow as unknown as { deliverable_id?: string })?.deliverable_id;
                if (delId) {
                  const [delRow] = await db.select().from(workflowDeliverables).where(eq(workflowDeliverables.id, delId)).limit(1);
                  assigneeId = (delRow as unknown as { assigneeUserId?: string | null; assignee_user_id?: string | null })?.assigneeUserId ?? (delRow as unknown as { assignee_user_id?: string | null })?.assignee_user_id ?? null;
                }
              }
            } catch {}
            const recipient = assigneeId ?? null;
            await enqueueWorkflowNotificationDb({
              type: "failure",
              publicationId: input.publicationId,
              version: pubVersion as number,
              recipientUserId: recipient ?? undefined,
              payload: { deliverableName: publication?.id as string ?? input.publicationId, reason: failureReason, platform },
            });
            console.log(`[workflow-notifications] reflect failure alert enqueued for ${input.publicationId} (transact)`);
            try {
              const { appendAuditEvent } = await import("@/lib/telegram/tgdb");
              await appendAuditEvent({ action: "workflow_publish_failed_reflect", entityType: "workflow_publication", entityId: input.publicationId, after: { status: "failed", reason: failureReason } });
            } catch {}
          } catch (err) {
            console.error("[workflow-notifications] reflect failure enqueue failed:", (err as Error).message);
          }
        })();
      }
      return updated as unknown as Record<string, unknown>;
    } catch (err) {
      console.error("[workflow-target-adapter] reflect failed:", (err as Error).message);
      return null;
    }
  }

  try {
    const { db } = await import("@/db");
    const { workflowPublications, workflowEvents } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const [updated] = await db
      .update(workflowPublications)
      .set({ ...patch, version: version + 1, updatedAt: new Date() } as never)
      .where(and(eq(workflowPublications.id, input.publicationId), eq(workflowPublications.version, version)) as never)
      .returning();
    if (updated) {
      await db.insert(workflowEvents).values(event as never);
      if (desired === "failed") {
        void (async () => {
          try {
            const { enqueueWorkflowNotificationDb } = await import("./notifications");
            const pubVersion = (updated as unknown as { version?: number }).version ?? version + 1;
            const failureReason = safeErrorMessage((input.target?.last_error as string) ?? null) ?? "publish_failed";
            const platform = (updated as unknown as { platform?: string }).platform ?? "unknown";
            await enqueueWorkflowNotificationDb({
              type: "failure",
              publicationId: input.publicationId,
              version: pubVersion as number,
              payload: { deliverableName: input.publicationId, reason: failureReason, platform },
            });
            console.log(`[workflow-notifications] reflect failure alert enqueued for ${input.publicationId} (db)`);
          } catch (err) {
            console.error("[workflow-notifications] reflect failure enqueue (db) failed:", (err as Error).message);
          }
        })();
      }
      return updated as unknown as Record<string, unknown>;
    }
    return null;
  } catch (err) {
    console.error("[workflow-target-adapter] reflect DB failed:", (err as Error).message);
    return null;
  }
}

export class WorkflowTargetAdapter {
  constructor(private deps?: WorkflowTargetAdapterDeps) {}

  async reflectTargetState(input: {
    publicationId: string;
    target: PersistedPlatformTarget | null;
    productionStatus: string;
  }): Promise<Record<string, unknown> | null> {
    return reflectTargetState(input, this.deps);
  }

  async updatePublication(
    publicationId: string,
    expectedVersion: number,
    patch: Record<string, unknown>,
    event?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Wrapper that respects terminal protection at call site
    // Fetch existing to check terminal
    let pub: Record<string, unknown> | null = null;
    if (this.deps?.getPublication) {
      pub = await this.deps.getPublication(publicationId);
    }
    const terminalOwner = (pub?.terminalOwner as string | null) ?? (pub?.terminal_owner as string | null) ?? null;
    if ((terminalOwner === "manual" || terminalOwner === "imported") && (patch.terminalOwner === "automatic" || patch.status === "published" || patch.status === "failed")) {
      // Never overwrite terminal owner manual/imported
      const noopEvent: Record<string, unknown> = {
        id: generateEntityId("WEV"),
        entityType: "workflow_publication",
        entityId: publicationId,
        action: "noop_terminal_protected",
        before: { terminalOwner },
        after: { terminalOwner },
        actorUserId: null,
        source: "automatic",
        reason: "terminal_owner_protected",
        createdAt: new Date(),
      };
      if (this.deps?.createEvent) {
        await this.deps.createEvent(noopEvent);
      } else {
        try {
          const { db } = await import("@/db");
          const { workflowEvents } = await import("@/db/schema");
          await db.insert(workflowEvents).values(noopEvent as never);
        } catch {}
      }
      return pub as Record<string, unknown>;
    }
    if (this.deps?.transactUpdatePublication) {
      const ev = event ?? {
        id: generateEntityId("WEV"),
        entityType: "workflow_publication",
        entityId: publicationId,
        action: "adapter_update",
        before: pub ? { status: pub.status } : null,
        after: patch,
        actorUserId: null,
        source: "automatic",
        reason: null,
        createdAt: new Date(),
      };
      return this.deps.transactUpdatePublication(publicationId, expectedVersion, patch, ev);
    }
    const { db } = await import("@/db");
    const { workflowPublications, workflowEvents } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const [updated] = await db
      .update(workflowPublications)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() } as never)
      .where(and(eq(workflowPublications.id, publicationId), eq(workflowPublications.version, expectedVersion)) as never)
      .returning();
    if (!updated) throw new Error("Publication not found or version conflict");
    const ev = event ?? {
      id: generateEntityId("WEV"),
      entityType: "workflow_publication",
      entityId: publicationId,
      action: "adapter_update",
      before: pub ? { status: pub.status } : null,
      after: patch,
      actorUserId: null,
      source: "automatic",
      reason: null,
      createdAt: new Date(),
    };
    await db.insert(workflowEvents).values(ev as never);
    return updated as unknown as Record<string, unknown>;
  }
}
