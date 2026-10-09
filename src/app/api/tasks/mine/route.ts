import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  contentPartActivities,
  contentParts,
  contentProducts,
  users,
  workflowDeliverables,
  workflowPrograms,
  workflowPublications,
} from "@/db/schema";
import { requireUser, jsonOk } from "@/lib/api-helpers";
import { normalizeJobFunctions } from "@/lib/job-functions";
import { isChannelHidden, getChannelLabelFa } from "@/lib/channels";
import { buildChecklistTasks, isTasksAdmin, type PartTaskInput } from "@/lib/tasks";

/**
 * Task queue for the signed-in user.
 * - checklist: first missing pipeline step per (part × own job)
 * - publications: ready/failed/scheduled publication legs (publisher_admin + admins)
 * - today: ticks completed today per person (admin report; ?userId= filters it)
 */
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const url = new URL(req.url);
  const personFilter = url.searchParams.get("userId")?.trim() || null;

  const jobs = normalizeJobFunctions((user as unknown as { jobFunctions?: unknown }).jobFunctions);
  const admin = isTasksAdmin((user as unknown as { role?: string }).role, jobs);
  const queueJobs = admin ? (["full_editor", "reel_editor", "graphic"] as const) : jobs;

  // --- content-room checklist tasks ---
  const productRows = (await db
    .select({
      id: contentProducts.id,
      title: contentProducts.title,
      channel: contentProducts.channel,
      status: contentProducts.status,
    })
    .from(contentProducts)
    .where(isNull(contentProducts.archivedAt))
    .orderBy(desc(contentProducts.updatedAt))
    .limit(200)) as unknown as Array<{ id: string; title: string; channel: string; status: string }>;

  const visibleProducts = productRows.filter((p) => !isChannelHidden(p.channel));
  const productIds = visibleProducts.map((p) => p.id);
  const productById = new Map(visibleProducts.map((p) => [p.id, p]));

  let checklist: ReturnType<typeof buildChecklistTasks> = [];
  if (productIds.length && queueJobs.length) {
    const partRows = (await db
      .select({
        id: contentParts.id,
        productId: contentParts.productId,
        partNumber: contentParts.partNumber,
      })
      .from(contentParts)
      .where(and(inArray(contentParts.productId, productIds), eq(contentParts.isActive, true)))
      .limit(2000)) as unknown as Array<{ id: string; productId: string; partNumber: number }>;
    const partIds = partRows.map((r) => r.id);
    const actsByPart = new Map<string, Record<string, boolean>>();
    const prevByPart = new Set<string>();
    if (partIds.length) {
      const actRows = (await db
        .select({
          partId: contentPartActivities.partId,
          activity: contentPartActivities.activity,
          isDone: contentPartActivities.isDone,
        })
        .from(contentPartActivities)
        .where(inArray(contentPartActivities.partId, partIds))
        .limit(20000)) as unknown as Array<{ partId: string; activity: string; isDone: boolean }>;
      for (const ar of actRows) {
        if (!actsByPart.has(ar.partId)) actsByPart.set(ar.partId, {});
        actsByPart.get(ar.partId)![ar.activity] = !!ar.isDone;
        if (ar.activity === "previously_published" && ar.isDone) prevByPart.add(ar.partId);
      }
    }
    const inputs: PartTaskInput[] = partRows.flatMap((r) => {
      const p = productById.get(r.productId);
      if (!p) return [];
      return [
        {
          partId: r.id,
          productId: r.productId,
          productTitle: p.title,
          channel: p.channel,
          channelLabel: getChannelLabelFa(p.channel),
          partNumber: r.partNumber,
          activities: actsByPart.get(r.id) ?? {},
          previouslyPublished: prevByPart.has(r.id),
        },
      ];
    });
    checklist = buildChecklistTasks(inputs, queueJobs);
  }

  // --- publisher queue: publications needing action ---
  let publications: Array<{
    id: string;
    platform: string;
    status: string;
    scheduledAt: string | null;
    programId: string;
    programTitle: string;
    deliverableName: string;
    deliverableKind: string | null;
    href: string;
  }> = [];
  if (admin || jobs.includes("publisher_admin")) {
    const pubRows = (await db
      .select({
        id: workflowPublications.id,
        platform: workflowPublications.platform,
        status: workflowPublications.status,
        scheduledAt: workflowPublications.scheduledAt,
        deliverableId: workflowPublications.deliverableId,
      })
      .from(workflowPublications)
      .where(inArray(workflowPublications.status, ["ready", "failed", "scheduled"]))
      .orderBy(desc(workflowPublications.updatedAt))
      .limit(200)) as unknown as Array<{
      id: string;
      platform: string;
      status: string;
      scheduledAt: Date | string | null;
      deliverableId: string;
    }>;
    if (pubRows.length) {
      const delIds = [...new Set(pubRows.map((p) => p.deliverableId))];
      const delRows = (await db
        .select({
          id: workflowDeliverables.id,
          programId: workflowDeliverables.programId,
          name: workflowDeliverables.name,
          kind: workflowDeliverables.kind,
        })
        .from(workflowDeliverables)
        .where(inArray(workflowDeliverables.id, delIds))) as unknown as Array<{
        id: string;
        programId: string;
        name: string;
        kind: string | null;
      }>;
      const delById = new Map(delRows.map((d) => [d.id, d]));
      const progIds = [...new Set(delRows.map((d) => d.programId))];
      const progRows = progIds.length
        ? ((await db
            .select({ id: workflowPrograms.id, title: workflowPrograms.title })
            .from(workflowPrograms)
            .where(and(inArray(workflowPrograms.id, progIds), isNull(workflowPrograms.archivedAt)))) as unknown as Array<{
            id: string;
            title: string;
          }>)
        : [];
      const progById = new Map(progRows.map((p) => [p.id, p]));
      publications = pubRows.flatMap((p) => {
        const d = delById.get(p.deliverableId);
        if (!d) return [];
        const prog = progById.get(d.programId);
        if (!prog) return [];
        return [
          {
            id: p.id,
            platform: p.platform,
            status: p.status,
            scheduledAt: p.scheduledAt ? new Date(p.scheduledAt).toISOString() : null,
            programId: d.programId,
            programTitle: prog.title,
            deliverableName: d.name,
            deliverableKind: d.kind,
            href: `/workflow/${d.programId}`,
          },
        ];
      });
    }
  }

  // --- today's done ticks (admin report) ---
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const doneConditions = [eq(contentPartActivities.isDone, true), gte(contentPartActivities.completedAt, dayStart), isNotNull(contentPartActivities.completedBy)];
  const todayRows = (await db
    .select({
      partId: contentPartActivities.partId,
      activity: contentPartActivities.activity,
      completedAt: contentPartActivities.completedAt,
      completedBy: contentPartActivities.completedBy,
    })
    .from(contentPartActivities)
    .where(personFilter ? and(...doneConditions, eq(contentPartActivities.completedBy, personFilter)) : and(...doneConditions))
    .orderBy(desc(contentPartActivities.completedAt))
    .limit(200)) as unknown as Array<{ partId: string; activity: string; completedAt: Date | string | null; completedBy: string | null }>;

  const userRows = (await db.select({ id: users.id, name: users.name }).from(users)) as unknown as Array<{ id: string; name: string }>;
  const nameById = new Map(userRows.map((u) => [u.id, u.name]));
  const perPerson = new Map<string, { userId: string; name: string; count: number }>();
  for (const r of todayRows) {
    if (!r.completedBy) continue;
    const e = perPerson.get(r.completedBy) ?? { userId: r.completedBy, name: nameById.get(r.completedBy) ?? r.completedBy, count: 0 };
    e.count += 1;
    perPerson.set(r.completedBy, e);
  }

  return jsonOk({
    jobs,
    isAdmin: admin,
    checklist: checklist.slice(0, 300),
    publications: publications.slice(0, 200),
    today: [...perPerson.values()].sort((a, b) => b.count - a.count),
    todayTotal: todayRows.length,
  });
}
