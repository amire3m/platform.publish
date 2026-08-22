export type DraftPlatform = "telegram" | "youtube" | "instagram";

export interface DraftDestination {
  platform: DraftPlatform;
  socialAccountId?: string | null;
}

export interface WorkflowTemplateItem {
  id: string;
  name: string;
  kind?: string | null;
  sortOrder: number;
  destinations: DraftDestination[];
  dueOffsetMinutes?: number | null;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string | null;
  items: WorkflowTemplateItem[];
}

export interface DraftDeliverable {
  draftId: string;
  name: string;
  kind?: string | null;
  sortOrder: number;
  destinations: DraftDestination[];
  dueOffsetMinutes?: number | null;
  dueAt: string | null;
  assigneeUserId?: string | null;
  notes?: string | null;
}

export interface WorkflowDraft {
  templateId: string | null;
  templateName?: string | null;
  deliverables: DraftDeliverable[];
}

function generateDraftId(): string {
  try {
    // crypto.randomUUID is available in node 19+ and browsers
    const c = globalThis.crypto as unknown as { randomUUID?: () => string };
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // ignore
  }
  return `draft_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function deepCloneDestinations(destinations: DraftDestination[]): DraftDestination[] {
  return destinations.map((d) => ({ platform: d.platform, socialAccountId: d.socialAccountId ?? null }));
}

function calculateDueAt(
  baseDueAt: string | Date | null | undefined,
  dueOffsetMinutes: number | null | undefined,
): string | null {
  if (baseDueAt == null || dueOffsetMinutes == null) return null;
  const base = baseDueAt instanceof Date ? baseDueAt : new Date(baseDueAt);
  if (Number.isNaN(base.getTime())) return null;
  if (typeof dueOffsetMinutes !== "number" || Number.isNaN(dueOffsetMinutes)) return null;
  const ms = dueOffsetMinutes * 60 * 1000;
  return new Date(base.getTime() + ms).toISOString();
}

export function draftFromTemplate(
  template: WorkflowTemplate,
  opts?: { baseDueAt?: string | Date | null },
): WorkflowDraft {
  const baseDueAt = opts?.baseDueAt ?? null;
  const sorted = [...template.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const deliverables: DraftDeliverable[] = sorted.map((item, idx) => ({
    draftId: generateDraftId(),
    name: item.name,
    kind: item.kind ?? null,
    sortOrder: item.sortOrder ?? idx,
    destinations: deepCloneDestinations(item.destinations ?? []),
    dueOffsetMinutes: item.dueOffsetMinutes ?? null,
    dueAt: calculateDueAt(baseDueAt, item.dueOffsetMinutes),
    assigneeUserId: null,
    notes: null,
  }));

  return {
    templateId: template.id,
    templateName: template.name,
    deliverables,
  };
}

export function createEmptyDraft(): WorkflowDraft {
  return { templateId: null, templateName: null, deliverables: [] };
}

export function createBlankDeliverable(overrides?: Partial<Omit<DraftDeliverable, "draftId" | "destinations">> & { destinations?: DraftDestination[] }): DraftDeliverable {
  return {
    draftId: generateDraftId(),
    name: overrides?.name ?? "خروجی جدید",
    kind: overrides?.kind ?? null,
    sortOrder: overrides?.sortOrder ?? 0,
    destinations: deepCloneDestinations(overrides?.destinations ?? []),
    dueOffsetMinutes: overrides?.dueOffsetMinutes ?? null,
    dueAt: overrides?.dueAt ?? null,
    assigneeUserId: overrides?.assigneeUserId ?? null,
    notes: overrides?.notes ?? null,
  };
}

export function addDeliverableToDraft(draft: WorkflowDraft, deliverable: DraftDeliverable): WorkflowDraft {
  return {
    ...draft,
    deliverables: [...draft.deliverables, { ...deliverable, destinations: deepCloneDestinations(deliverable.destinations) }],
  };
}

export function removeDeliverableFromDraft(draft: WorkflowDraft, draftId: string): WorkflowDraft {
  return {
    ...draft,
    deliverables: draft.deliverables.filter((d) => d.draftId !== draftId),
  };
}

export function reorderDeliverables(draft: WorkflowDraft, fromIndex: number, toIndex: number): WorkflowDraft {
  const list = [...draft.deliverables];
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return draft;
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  // re-normalize sortOrder
  const reordered = list.map((d, idx) => ({ ...d, sortOrder: idx }));
  return { ...draft, deliverables: reordered };
}

export function updateDeliverableInDraft(
  draft: WorkflowDraft,
  draftId: string,
  patch: Partial<Omit<DraftDeliverable, "draftId">>,
): WorkflowDraft {
  return {
    ...draft,
    deliverables: draft.deliverables.map((d) =>
      d.draftId === draftId
        ? {
            ...d,
            ...patch,
            destinations: patch.destinations ? deepCloneDestinations(patch.destinations) : d.destinations,
          }
        : d,
    ),
  };
}

export function recalculateDraftDueDates(draft: WorkflowDraft, baseDueAt: string | Date | null): WorkflowDraft {
  return {
    ...draft,
    deliverables: draft.deliverables.map((d) => ({
      ...d,
      dueAt: d.dueOffsetMinutes != null ? calculateDueAt(baseDueAt, d.dueOffsetMinutes) : d.dueAt,
    })),
  };
}

export { calculateDueAt, generateDraftId };
