"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Label, Select, Textarea, ErrorState, Skeleton } from "@/components/ui";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import { deliverableKindLabelFa, platformLabelFa } from "@/lib/presentation-fa";
import {
  addDeliverableToDraft,
  calculateDueAt,
  createBlankDeliverable,
  createEmptyDraft,
  draftFromTemplate,
  recalculateDraftDueDates,
  removeDeliverableFromDraft,
  reorderDeliverables,
  updateDeliverableInDraft,
  type DraftDestination,
  type DraftPlatform,
  type WorkflowDraft,
  type WorkflowTemplate,
} from "@/lib/workflow/draft";

type TemplateListResponse = WorkflowTemplate[] | { templates: WorkflowTemplate[] } | { items: WorkflowTemplate[] } | null;

async function templateFetcher(url: string): Promise<WorkflowTemplate[]> {
  const data = await fetchWorkflowApi<TemplateListResponse>(url);
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    if (Array.isArray((data as { templates?: unknown }).templates)) return (data as { templates: WorkflowTemplate[] }).templates;
    if (Array.isArray((data as { items?: unknown }).items)) return (data as { items: WorkflowTemplate[] }).items;
  }
  return [];
}

const PLATFORMS: Array<{ value: DraftPlatform; label: string }> = [
  { value: "telegram", label: "تلگرام" },
  { value: "youtube", label: "یوتیوب" },
  { value: "instagram", label: "اینستاگرام" },
];

function normalizeDateInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ProgramWizard() {
  const router = useRouter();

  const { data: templates, error: templatesError, isLoading: templatesLoading } = useSWR<WorkflowTemplate[], Error>(
    "/api/workflow/templates",
    templateFetcher,
  );

  const [step, setStep] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | "blank">("blank");
  const [draft, setDraft] = useState<WorkflowDraft>(() => createEmptyDraft());

  // program metadata
  const [title, setTitle] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [dueAtInput, setDueAtInput] = useState(""); // datetime-local
  const [notes, setNotes] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const baseDueAt = useMemo(() => normalizeDateInput(dueAtInput), [dueAtInput]);

  // Keep dueAt in sync when program due changes and deliverables have offsets
  useEffect(() => {
    if (!baseDueAt) return;
    setDraft((prev) => {
      const hasOffset = prev.deliverables.some((d) => d.dueOffsetMinutes != null);
      if (!hasOffset) return prev;
      return recalculateDraftDueDates(prev, baseDueAt);
    });
  }, [baseDueAt]);

  function handleSelectTemplate(nextId: string | "blank") {
    setSelectedTemplateId(nextId);
    if (nextId === "blank") {
      setDraft(createEmptyDraft());
      return;
    }
    const tmpl = templates?.find((t) => t.id === nextId);
    if (tmpl) {
      const base = normalizeDateInput(dueAtInput);
      setDraft(draftFromTemplate(tmpl, { baseDueAt: base }));
    }
  }

  function handleAddDeliverable() {
    const blank = createBlankDeliverable({ sortOrder: draft.deliverables.length });
    setDraft((prev) => addDeliverableToDraft(prev, blank));
  }

  function handleRemove(draftId: string) {
    setDraft((prev) => removeDeliverableFromDraft(prev, draftId));
  }

  function handleMove(from: number, to: number) {
    setDraft((prev) => reorderDeliverables(prev, from, to));
  }

  function handleUpdate(draftId: string, patch: Parameters<typeof updateDeliverableInDraft>[2]) {
    setDraft((prev) => updateDeliverableInDraft(prev, draftId, patch));
  }

  function toggleDestination(draftId: string, platform: DraftPlatform) {
    const found = draft.deliverables.find((d) => d.draftId === draftId);
    if (!found) return;
    const has = found.destinations.some((x) => x.platform === platform);
    const next: DraftDestination[] = has
      ? found.destinations.filter((x) => x.platform !== platform)
      : [...found.destinations, { platform }];
    handleUpdate(draftId, { destinations: next });
  }

  async function handleSave() {
    if (!title.trim()) {
      setSaveError("عنوان برنامه الزامی است.");
      setStep(1);
      return;
    }
    if (draft.deliverables.length === 0) {
      setSaveError("حداقل یک خروجی اضافه کنید.");
      setStep(2);
      return;
    }
    // validate deliverable names
    for (const d of draft.deliverables) {
      if (!d.name.trim()) {
        setSaveError("نام همه خروجی‌ها الزامی است.");
        setStep(2);
        return;
      }
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        title: title.trim(),
        seriesName: seriesName.trim() || null,
        dueAt: normalizeDateInput(dueAtInput),
        notes: notes.trim() || null,
        ownerUserId: ownerUserId.trim() || null,
        // keep original template snapshot immutably as deliverables
        deliverables: draft.deliverables.map((d, idx) => ({
          // client-side draftId is not sent; server generates real ids
          name: d.name.trim(),
          kind: d.kind ?? null,
          sortOrder: idx,
          destinations: d.destinations,
          dueAt: d.dueAt ?? (d.dueOffsetMinutes != null && baseDueAt ? calculateDueAt(baseDueAt, d.dueOffsetMinutes) : d.dueAt),
          dueOffsetMinutes: d.dueOffsetMinutes,
          assigneeUserId: d.assigneeUserId || null,
          notes: d.notes || null,
        })),
        templateId: draft.templateId,
      };

      await fetchWorkflowApi("/api/workflow/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      router.push("/workflow");
      router.refresh();
    } catch (e) {
      const msg = e instanceof WorkflowApiError ? e.message : e instanceof Error ? e.message : "خطا در ذخیره برنامه";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  const canNextFromTemplate = true;
  const canNextFromMetadata = title.trim().length > 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Step indicator */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          "الگو",
          "مشخصات برنامه",
          "خروجی‌ها",
          "مقاصد",
          "مرور و ذخیره",
        ].map((label, idx) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                idx === step ? "bg-tg-accent text-white" : idx < step ? "bg-emerald-500 text-white" : "bg-tg-hover text-tg-secondary"
              }`}
            >
              {idx < step ? <Check className="h-4 w-4" /> : idx + 1}
            </span>
            <span className={idx === step ? "font-semibold text-tg-text" : "text-tg-secondary"}>{label}</span>
            {idx < 4 && <span className="mx-1 text-tg-border">—</span>}
          </div>
        ))}
      </div>

      {saveError && <ErrorState message={saveError} />}

      {step === 0 && (
        <Card className="space-y-4">
          <h2 className="text-sm font-bold text-tg-text">انتخاب نقطه شروع</h2>
          <p className="text-xs text-tg-secondary">از یک الگو شروع کنید یا برنامه خالی بسازید. الگو یک نسخه ثابت است و تغییر بعدی الگو برنامه‌های قبلی را تغییر نمی‌دهد.</p>

          {templatesLoading && <Skeleton className="h-20" />}
          {templatesError && (
            <ErrorState message={templatesError instanceof WorkflowApiError && templatesError.status === 404 ? "الگوها هنوز در دسترس نیستند (GET /api/workflow/templates در دسترس نیست)." : templatesError.message} />
          )}

          <div className="grid gap-3">
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${selectedTemplateId === "blank" ? "border-tg-accent bg-tg-accent/5" : "border-tg-border hover:bg-tg-hover/40"}`}>
              <input type="radio" name="template" checked={selectedTemplateId === "blank"} onChange={() => handleSelectTemplate("blank")} className="h-4 w-4 accent-[--tg-accent]" />
              <div>
                <p className="text-sm font-semibold text-tg-text">برنامه خالی</p>
                <p className="text-xs text-tg-secondary">بدون خروجی پیش‌فرض، خودتان خروجی‌ها را اضافه می‌کنید.</p>
              </div>
            </label>

            {(templates ?? []).map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${selectedTemplateId === t.id ? "border-tg-accent bg-tg-accent/5" : "border-tg-border hover:bg-tg-hover/40"}`}
              >
                <input type="radio" name="template" checked={selectedTemplateId === t.id} onChange={() => handleSelectTemplate(t.id)} className="h-4 w-4 accent-[--tg-accent]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-tg-text">{t.name}</p>
                  {t.description && <p className="text-xs text-tg-secondary">{t.description}</p>}
                  <p className="text-xs text-tg-secondary">{t.items?.length ?? 0} خروجی پیش‌فرض</p>
                </div>
              </label>
            ))}

            {!templatesLoading && (templates?.length ?? 0) === 0 && (
              <p className="rounded-lg border border-dashed border-tg-border p-4 text-center text-xs text-tg-secondary">الگویی ثبت نشده؛ با «برنامه خالی» ادامه دهید یا از مدیریت الگوها یک الگو بسازید.</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} disabled={!canNextFromTemplate} className="min-h-[44px]">
              ادامه
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-4">
          <h2 className="text-sm font-bold text-tg-text">مشخصات برنامه</h2>

          <div className="grid gap-4">
            <div>
              <Label>عنوان برنامه *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: برنامه هفتگی ۱۶" className="mt-1" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>نام سری (اختیاری)</Label>
                <Input value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="مثال: سری آموزش" className="mt-1" />
              </div>
              <div>
                <Label>موعد برنامه (اختیاری)</Label>
                <Input type="datetime-local" value={dueAtInput} onChange={(e) => setDueAtInput(e.target.value)} className="mt-1" />
                <p className="mt-1 text-xs text-tg-secondary">موعد خروجی‌ها با فاصله زمانی تعیین‌شده نسبت به این تاریخ محاسبه می‌شود.</p>
              </div>
            </div>
            <div>
              <Label>مالک یا مسئول کل برنامه (شناسه کاربر، اختیاری)</Label>
              <Input value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} placeholder="شناسه کاربر" className="mt-1" />
            </div>
            <div>
              <Label>یادداشت</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="توضیحات تکمیلی..." className="mt-1" />
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(0)} className="min-h-[44px]">
              <ArrowRight className="h-4 w-4" />
              بازگشت
            </Button>
            <Button onClick={() => setStep(2)} disabled={!canNextFromMetadata} className="min-h-[44px]">
              ادامه
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-tg-text">خروجی‌ها، مسئولان و موعدها</h2>
            <Button size="sm" variant="secondary" onClick={handleAddDeliverable} className="min-h-[36px]">
              <Plus className="h-4 w-4" />
              افزودن خروجی
            </Button>
          </div>
          <p className="text-xs text-tg-secondary">نام، نوع، مسئول، موعد و یادداشت هر خروجی را ویرایش کنید. می‌توانید ترتیب را تغییر دهید یا خروجی را حذف کنید. همه تغییرات قبل از ذخیره نهایی در مرورگر می‌ماند.</p>

          {draft.deliverables.length === 0 ? (
            <div className="rounded-xl border border-dashed border-tg-border p-8 text-center text-sm text-tg-secondary">هنوز خروجی ثبت نشده. یک خروجی اضافه کنید.</div>
          ) : (
            <div className="space-y-3">
              {draft.deliverables.map((d, idx) => (
                <div key={d.draftId} className="rounded-xl border border-tg-border bg-tg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-tg-secondary">
                      <GripVertical className="h-4 w-4" />
                      <span>#{idx + 1}</span>
                      <span className="font-mono text-[11px]">{d.draftId.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, idx - 1)}
                        aria-label="جابجایی به بالا"
                        className="h-8 w-8 p-0"
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={idx === draft.deliverables.length - 1}
                        onClick={() => handleMove(idx, idx + 1)}
                        aria-label="جابجایی به پایین"
                        className="h-8 w-8 p-0"
                      >
                        ↓
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleRemove(d.draftId)} aria-label="حذف خروجی" className="h-8 w-8 p-0 text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>نام خروجی *</Label>
                      <Input value={d.name} onChange={(e) => handleUpdate(d.draftId, { name: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label>نوع خروجی (اختیاری)</Label>
                      <Input value={d.kind ?? ""} onChange={(e) => handleUpdate(d.draftId, { kind: e.target.value || null })} placeholder="ویدئو / تصویر / ..." className="mt-1" />
                    </div>
                    <div>
                      <Label>مسئول (شناسه کاربر)</Label>
                      <Input value={d.assigneeUserId ?? ""} onChange={(e) => handleUpdate(d.draftId, { assigneeUserId: e.target.value || null })} placeholder="شناسه کاربر" className="mt-1" />
                    </div>
                    <div>
                      <Label>موعد</Label>
                      <Input
                        type="datetime-local"
                        value={d.dueAt ? new Date(d.dueAt).toISOString().slice(0, 16) : ""}
                        onChange={(e) => handleUpdate(d.draftId, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>فاصله زمانی نسبت به موعد برنامه (دقیقه)</Label>
                      <Input
                        type="number"
                        value={d.dueOffsetMinutes ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          const nextOffset = Number.isNaN(v as number) ? null : v;
                          const nextDue = nextOffset != null && baseDueAt ? calculateDueAt(baseDueAt, nextOffset) : d.dueAt;
                          handleUpdate(d.draftId, { dueOffsetMinutes: nextOffset, dueAt: nextDue });
                        }}
                        placeholder="مثال: -60"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>یادداشت</Label>
                      <Input value={d.notes ?? ""} onChange={(e) => handleUpdate(d.draftId, { notes: e.target.value || null })} className="mt-1" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)} className="min-h-[44px]">
              <ArrowRight className="h-4 w-4" />
              بازگشت
            </Button>
            <Button onClick={() => setStep(3)} className="min-h-[44px]">
              ادامه
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4">
          <h2 className="text-sm font-bold text-tg-text">مقاصد انتشار</h2>
          <p className="text-xs text-tg-secondary">برای هر خروجی مشخص کنید در کدام پلتفرم‌ها منتشر شود. هر مقصد یک تیک است؛ می‌توانید بعداً حساب کاربری را در جزئیات برنامه متصل کنید.</p>

          {draft.deliverables.length === 0 ? (
            <p className="text-sm text-tg-secondary">خروجی ثبت نشده.</p>
          ) : (
            <div className="space-y-3">
              {draft.deliverables.map((d) => (
                <div key={d.draftId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tg-border p-4">
                  <p className="text-sm font-semibold text-tg-text">{d.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((p) => {
                      const active = d.destinations.some((x) => x.platform === p.value);
                      return (
                        <label
                          key={p.value}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "border-tg-accent bg-tg-accent text-white" : "border-tg-border bg-tg-surface text-tg-secondary hover:bg-tg-hover"}`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={active}
                            onChange={() => toggleDestination(d.draftId, p.value)}
                          />
                          {p.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(2)} className="min-h-[44px]">
              <ArrowRight className="h-4 w-4" />
              بازگشت
            </Button>
            <Button onClick={() => setStep(4)} className="min-h-[44px]">
              مرور نهایی
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="space-y-4">
          <h2 className="text-sm font-bold text-tg-text">مرور و ذخیره</h2>
          <p className="text-xs text-tg-secondary">ذخیره فقط در همین مرحله انجام می‌شود. پس از ذخیره به اتاق انتشار باز می‌گردید.</p>

          <div className="grid gap-3 rounded-xl border border-tg-border bg-tg-hover/20 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-tg-secondary">عنوان</span>
              <span className="font-semibold text-tg-text">{title || "—"}</span>
            </div>
            {seriesName && (
              <div className="flex justify-between">
                <span className="text-tg-secondary">سری</span>
                <span className="text-tg-text">{seriesName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-tg-secondary">موعد برنامه</span>
              <span className="text-tg-text">{dueAtInput ? new Date(dueAtInput).toLocaleString("fa-IR") : "بدون موعد"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-tg-secondary">تعداد خروجی</span>
              <span className="text-tg-text">{draft.deliverables.length}</span>
            </div>
            {draft.templateId && (
              <div className="flex justify-between">
                <span className="text-tg-secondary">الگوی مبدأ</span>
                <span className="text-tg-text">{draft.templateName ?? draft.templateId}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {draft.deliverables.map((d, idx) => (
              <div key={d.draftId} className="rounded-lg border border-tg-border p-3">
                <p className="text-sm font-semibold text-tg-text">
                  {idx + 1}. {d.name} {d.kind ? <span className="text-xs font-normal text-tg-secondary">({deliverableKindLabelFa(d.kind)})</span> : null}
                </p>
                <p className="text-xs text-tg-secondary">
                   مسئول: {d.assigneeUserId ?? "—"} · موعد: {d.dueAt ? new Date(d.dueAt).toLocaleString("fa-IR") : "—"} · مقاصد: {d.destinations.map((x) => platformLabelFa(x.platform)).join("، ") || "—"}
                </p>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(3)} className="min-h-[44px]">
              <ArrowRight className="h-4 w-4" />
              بازگشت
            </Button>
            <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
              {saving ? "در حال ذخیره..." : "ذخیره برنامه"}
              {!saving && <Check className="h-4 w-4" />}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
