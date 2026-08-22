import { describe, expect, it } from "vitest";
import { draftFromTemplate, createEmptyDraft, addDeliverableToDraft, removeDeliverableFromDraft, reorderDeliverables, calculateDueAt, createBlankDeliverable, updateDeliverableInDraft, recalculateDraftDueDates } from "./draft";
import type { WorkflowTemplate } from "./draft";

function makeTemplate(): WorkflowTemplate {
  return {
    id: "tmpl_1",
    name: "الگوی استاندارد",
    description: "توضیح الگو",
    items: [
      {
        id: "item_1",
        name: "ویدیوی کامل",
        kind: "video",
        sortOrder: 0,
        destinations: [{ platform: "telegram" }, { platform: "youtube" }],
        dueOffsetMinutes: -60,
      },
      {
        id: "item_2",
        name: "کاور",
        kind: "image",
        sortOrder: 1,
        destinations: [{ platform: "instagram" }],
        dueOffsetMinutes: 120,
      },
    ],
  };
}

describe("draftFromTemplate immutable snapshot", () => {
  it("deep-copies items so template mutation does not affect draft", () => {
    const template = makeTemplate();
    const draft = draftFromTemplate(template);
    template.items[0].name = "تغییر یافته";
    expect(draft.deliverables[0].name).toBe("ویدیوی کامل");
  });

  it("deep-copies destinations", () => {
    const template = makeTemplate();
    const draft = draftFromTemplate(template);
    // mutate original destinations array
    (template.items[0].destinations as unknown as Array<{ platform: string }>)[0].platform = "instagram" as never;
    expect(draft.deliverables[0].destinations[0].platform).toBe("telegram");
    // mutate draft should not affect template
    draft.deliverables[0].destinations.push({ platform: "instagram" });
    expect(template.items[0].destinations).toHaveLength(2);
  });

  it("generates client draft IDs", () => {
    const template = makeTemplate();
    const draft = draftFromTemplate(template);
    expect(draft.deliverables[0].draftId).toBeTruthy();
    expect(draft.deliverables[1].draftId).toBeTruthy();
    expect(draft.deliverables[0].draftId).not.toBe(draft.deliverables[1].draftId);
    // ensure template IDs not reused as draftIds
    expect(draft.deliverables[0].draftId).not.toBe(template.items[0].id);
  });

  it("calculates due dates from offsets relative to baseDueAt", () => {
    const template = makeTemplate();
    const base = new Date("2026-08-22T10:00:00.000Z");
    const draft = draftFromTemplate(template, { baseDueAt: base });
    expect(draft.deliverables[0].dueAt).toBe(new Date(base.getTime() - 60 * 60000).toISOString());
    expect(draft.deliverables[1].dueAt).toBe(new Date(base.getTime() + 120 * 60000).toISOString());
  });

  it("returns null dueAt when no base or no offset", () => {
    const template = makeTemplate();
    const draft = draftFromTemplate(template);
    expect(draft.deliverables[0].dueAt).toBeNull();
    expect(calculateDueAt(null, -60)).toBeNull();
    expect(calculateDueAt(new Date(), null)).toBeNull();
  });

  it("permits add/remove/reorder before save", () => {
    const template = makeTemplate();
    let draft = draftFromTemplate(template);
    const blank = createBlankDeliverable({ name: "تیزر" });
    draft = addDeliverableToDraft(draft, blank);
    expect(draft.deliverables).toHaveLength(3);
    expect(draft.deliverables[2].name).toBe("تیزر");

    draft = removeDeliverableFromDraft(draft, draft.deliverables[0].draftId);
    expect(draft.deliverables).toHaveLength(2);
    expect(draft.deliverables[0].name).toBe("کاور");

    // reorder: move last to first
    draft = reorderDeliverables(draft, 1, 0);
    expect(draft.deliverables[0].name).toBe("تیزر");
  });

  it("recalculateDraftDueDates updates only offset-based items", () => {
    const draft = createEmptyDraft();
    const d1 = createBlankDeliverable({ name: "A", dueOffsetMinutes: 60, dueAt: null });
    const d2 = createBlankDeliverable({ name: "B", dueOffsetMinutes: null, dueAt: "2026-08-22T09:00:00.000Z" });
    let withItems = addDeliverableToDraft(addDeliverableToDraft(draft, d1), d2);
    const base = new Date("2026-08-22T10:00:00.000Z");
    withItems = recalculateDraftDueDates(withItems, base);
    expect(withItems.deliverables[0].dueAt).toBe(new Date(base.getTime() + 60 * 60000).toISOString());
    expect(withItems.deliverables[1].dueAt).toBe("2026-08-22T09:00:00.000Z");
  });

  it("updateDeliverableInDraft deep copies destinations", () => {
    const template = makeTemplate();
    let draft = draftFromTemplate(template);
    const newDest: Array<{ platform: "telegram" | "youtube" | "instagram" }> = [{ platform: "youtube" }, { platform: "instagram" }];
    draft = updateDeliverableInDraft(draft, draft.deliverables[0].draftId, { destinations: newDest });
    newDest.push({ platform: "telegram" });
    expect(draft.deliverables[0].destinations).toHaveLength(2);
  });
});
