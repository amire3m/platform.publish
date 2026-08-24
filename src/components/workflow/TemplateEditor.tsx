"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowDown, ArrowUp, Edit2, Archive, Plus, Trash2, Save, X } from "lucide-react";
import { Button, Card, Input, Label, Textarea, ErrorState, Skeleton, ConfirmModal } from "@/components/ui";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import type { DraftPlatform, DraftDestination } from "@/lib/workflow/draft";
import { deliverableKindLabelFa, platformLabelFa } from "@/lib/presentation-fa";

interface TemplateItem {
  id: string;
  templateId?: string;
  name: string;
  kind?: string | null;
  sortOrder: number;
  destinations: DraftDestination[];
  dueOffsetMinutes?: number | null;
}

interface Template {
  id: string;
  name: string;
  description?: string | null;
  active?: boolean;
  archivedAt?: string | null;
  items?: TemplateItem[];
  templateItems?: TemplateItem[];
  instanceCount?: number | null;
  programCount?: number | null;
  usageCount?: number | null;
  createdAt?: string | null;
}

type TemplateListResponse = Template[] | { templates: Template[] } | { items: Template[] } | null;

async function fetcher(url: string): Promise<Template[]> {
  const data = await fetchWorkflowApi<TemplateListResponse>(url);
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    if (Array.isArray((data as { templates?: unknown }).templates)) return (data as { templates: Template[] }).templates;
    if (Array.isArray((data as { items?: unknown }).items)) return (data as { items: Template[] }).items;
  }
  return [];
}

async function meFetcher(url: string): Promise<{ permissions?: string[] } | null> {
  try {
    return await fetchWorkflowApi<{ permissions?: string[] }>(url);
  } catch {
    return null;
  }
}

const PLATFORMS: Array<{ value: DraftPlatform; label: string }> = [
  { value: "telegram", label: "تلگرام" },
  { value: "youtube", label: "یوتیوب" },
  { value: "instagram", label: "اینستاگرام" },
];

function getItems(t: Template): TemplateItem[] {
  const raw = t.items ?? t.templateItems ?? [];
  return [...raw].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function TemplateEditor() {
  const { data: me } = useSWR<{ permissions?: string[] } | null>("/api/auth/me", meFetcher);
  const canManage = useMemo(() => {
    const perms = new Set(me?.permissions ?? []);
    return perms.has("manage_workflow_templates");
  }, [me]);

  const { data: templates, error, isLoading, mutate } = useSWR<Template[], Error>("/api/workflow/templates", fetcher);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // editing template meta
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // add item
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemKind, setNewItemKind] = useState("");
  const [newItemDestinations, setNewItemDestinations] = useState<DraftPlatform[]>([]);
  const [newItemOffset, setNewItemOffset] = useState("");

  // edit item inline
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemKind, setEditItemKind] = useState("");
  const [editItemOffset, setEditItemOffset] = useState("");
  const [editItemDestinations, setEditItemDestinations] = useState<DraftPlatform[]>([]);

  // archive confirm
  const [archiveTarget, setArchiveTarget] = useState<Template | null>(null);

  async function refresh() {
    await mutate();
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleCreate() {
    if (!newName.trim()) {
      setActionError("نام الگو الزامی است.");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await fetchWorkflowApi("/api/workflow/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      });
      setNewName("");
      setNewDesc("");
      setCreating(false);
      await refresh();
      showToast("الگو ایجاد شد.");
    } catch (e) {
      setActionError(e instanceof WorkflowApiError ? e.message : e instanceof Error ? e.message : "خطا در ایجاد الگو");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(t: Template) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDesc(t.description ?? "");
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) {
      setActionError("نام الگو الزامی است.");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await fetchWorkflowApi(`/api/workflow/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      setEditingId(null);
      await refresh();
      showToast("الگو به‌روزرسانی شد.");
    } catch (e) {
      setActionError(e instanceof WorkflowApiError ? e.message : e instanceof Error ? e.message : "خطا در ویرایش الگو");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(t: Template) {
    setSaving(true);
    setActionError(null);
    try {
      await fetchWorkflowApi(`/api/workflow/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivedAt: new Date().toISOString(), active: false }),
      });
      setArchiveTarget(null);
      await refresh();
      showToast("الگو آرشیو شد.");
    } catch (e) {
      // fallback to dedicated archive endpoint if patch fails
      try {
        await fetchWorkflowApi(`/api/workflow/templates/${t.id}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        setArchiveTarget(null);
        await refresh();
        showToast("الگو آرشیو شد.");
      } catch (e2) {
        setActionError(e2 instanceof WorkflowApiError ? e2.message : e instanceof WorkflowApiError ? e.message : "خطا در آرشیو الگو");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddItem(templateId: string) {
    if (!newItemName.trim()) {
      setActionError("نام خروجی الزامی است.");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const payload = {
        name: newItemName.trim(),
        kind: newItemKind.trim() || null,
        destinations: newItemDestinations.map((p) => ({ platform: p })),
        dueOffsetMinutes: newItemOffset === "" ? null : Number(newItemOffset),
      };
      await fetchWorkflowApi(`/api/workflow/templates/${templateId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setNewItemName("");
      setNewItemKind("");
      setNewItemDestinations([]);
      setNewItemOffset("");
      setAddingItemFor(null);
      await refresh();
      showToast("آیتم اضافه شد.");
    } catch (e) {
      setActionError(e instanceof WorkflowApiError ? e.message : e instanceof Error ? e.message : "خطا در افزودن آیتم");
    } finally {
      setSaving(false);
    }
  }

  function startEditItem(item: TemplateItem) {
    setEditingItemId(item.id);
    setEditItemName(item.name);
    setEditItemKind(item.kind ?? "");
    setEditItemOffset(item.dueOffsetMinutes != null ? String(item.dueOffsetMinutes) : "");
    setEditItemDestinations(item.destinations.map((d) => d.platform));
  }

  async function saveItem(templateId: string, itemId: string) {
    if (!editItemName.trim()) {
      setActionError("نام آیتم الزامی است.");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await fetchWorkflowApi(`/api/workflow/templates/${templateId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editItemName.trim(),
          kind: editItemKind.trim() || null,
          destinations: editItemDestinations.map((p) => ({ platform: p })),
          dueOffsetMinutes: editItemOffset === "" ? null : Number(editItemOffset),
        }),
      });
      setEditingItemId(null);
      await refresh();
      showToast("آیتم ویرایش شد.");
    } catch (e) {
      setActionError(e instanceof WorkflowApiError ? e.message : e instanceof Error ? e.message : "خطا در ویرایش آیتم");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem(templateId: string, itemId: string) {
    setSaving(true);
    setActionError(null);
    try {
      await fetchWorkflowApi(`/api/workflow/templates/${templateId}/items/${itemId}`, { method: "DELETE" });
      await refresh();
      showToast("آیتم حذف شد.");
    } catch (e) {
      setActionError(e instanceof WorkflowApiError ? e.message : e instanceof Error ? e.message : "خطا در حذف آیتم");
    } finally {
      setSaving(false);
    }
  }

  async function handleReorder(templateId: string, items: TemplateItem[], from: number, to: number) {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const orderedIds = next.map((x) => x.id);
    setSaving(true);
    setActionError(null);
    try {
      // optimistic reorder
      await fetchWorkflowApi(`/api/workflow/templates/${templateId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: orderedIds, sortOrder: orderedIds }),
      });
      await refresh();
      showToast("ترتیب به‌روزرسانی شد.");
    } catch (e) {
      // fallback: patch each item sortOrder sequentially if reorder endpoint missing
      try {
        for (let i = 0; i < next.length; i++) {
          await fetchWorkflowApi(`/api/workflow/templates/${templateId}/items/${next[i].id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: i }),
          });
        }
        await refresh();
        showToast("ترتیب به‌روزرسانی شد.");
      } catch (e2) {
        setActionError(e2 instanceof WorkflowApiError ? e2.message : e instanceof WorkflowApiError ? e.message : "خطا در جابجایی");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="space-y-4" dir="rtl">
        <Card>
          <h2 className="text-sm font-bold text-tg-text">مدیریت الگوها</h2>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">برای مدیریت الگوها به مجوز «مدیریت الگوهای گردش کار» نیاز است. نمایش فقط خواندنی است.</p>
        </Card>
        {isLoading ? <Skeleton className="h-24" /> : null}
        {error ? <ErrorState message={error.message} /> : null}
        {(templates ?? []).length === 0 && !isLoading && !error && <Card><p className="text-sm text-tg-secondary">الگویی ثبت نشده.</p></Card>}
        {(templates ?? []).map((t) => (
          <Card key={t.id} className="space-y-2">
            <p className="font-semibold text-tg-text">{t.name}</p>
            {t.description && <p className="text-xs text-tg-secondary">{t.description}</p>}
            <div className="flex flex-wrap gap-2">
              {getItems(t).map((it) => (
                <span key={it.id} className="rounded-full border border-tg-border bg-tg-hover px-2.5 py-1 text-xs text-tg-secondary">
                  {it.name}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-tg-text">الگوهای برنامه</h2>
          <p className="text-xs text-tg-secondary">الگو یک نسخه ثابت است؛ تغییر الگو برنامه‌های قبلی را تغییر نمی‌دهد. بایگانی الگوی دارای نمونه موجود نیازمند تأیید است.</p>
        </div>
        <Button onClick={() => setCreating((v) => !v)} variant={creating ? "secondary" : "primary"} className="min-h-[44px]">
          {creating ? <><X className="h-4 w-4" /> بستن</> : <><Plus className="h-4 w-4" /> ایجاد الگو</>}
        </Button>
      </div>

      {toast && <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{toast}</div>}
      {actionError && <ErrorState message={actionError} />}

      {creating && (
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-tg-text">الگوی جدید</h3>
          <div>
            <Label>نام الگو *</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: الگوی استاندارد" className="mt-1" />
          </div>
          <div>
            <Label>توضیح</Label>
            <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} placeholder="توضیح اختیاری" className="mt-1" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={saving} className="min-h-[44px]">
              <Save className="h-4 w-4" />
              {saving ? "در حال ایجاد..." : "ایجاد"}
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)} className="min-h-[44px]">انصراف</Button>
          </div>
        </Card>
      )}

      {isLoading && <Skeleton className="h-32" />}
      {error && <ErrorState message={error instanceof WorkflowApiError && error.status === 404 ? "الگوها هنوز در دسترس نیستند." : error.message} />}

      {!isLoading && !error && (templates?.length ?? 0) === 0 && (
        <Card><p className="text-center text-sm text-tg-secondary">هنوز الگویی ایجاد نشده. اولین الگوی خود را بسازید.</p></Card>
      )}

      {(templates ?? []).map((t) => {
        const items = getItems(t);
        const instanceCount = t.instanceCount ?? t.programCount ?? t.usageCount ?? null;
        const hasInstances = typeof instanceCount === "number" && instanceCount > 0;
        const isEditing = editingId === t.id;
        return (
          <Card key={t.id} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="نام الگو" />
                    <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} placeholder="توضیح" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(t.id)} disabled={saving}>ذخیره</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>انصراف</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-semibold text-tg-text">{t.name}</p>
                    {t.description && <p className="text-xs text-tg-secondary">{t.description}</p>}
                    <p className="mt-1 text-xs text-tg-secondary">{items.length} آیتم · {hasInstances ? `${instanceCount} برنامه از این الگو ساخته شده` : "بدون نمونه"}</p>
                  </>
                )}
              </div>
              {!isEditing && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(t)} aria-label="ویرایش الگو" className="h-8 w-8 p-0">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(t)} aria-label="آرشیو الگو" className="h-8 w-8 p-0 text-amber-600">
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-tg-secondary">آیتم‌ها (مقصدها و فاصله زمانی موعد)</p>
                <Button size="sm" variant="secondary" onClick={() => setAddingItemFor(addingItemFor === t.id ? null : t.id)}>{addingItemFor === t.id ? "بستن" : "افزودن آیتم"}</Button>
              </div>

              {addingItemFor === t.id && (
                <div className="rounded-xl border border-tg-border bg-tg-hover/20 p-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>نام خروجی *</Label>
                      <Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label>نوع</Label>
                       <Input value={newItemKind} onChange={(e) => setNewItemKind(e.target.value)} placeholder="ویدئو" className="mt-1" />
                    </div>
                    <div>
                       <Label>فاصله زمانی موعد (دقیقه)</Label>
                      <Input type="number" value={newItemOffset} onChange={(e) => setNewItemOffset(e.target.value)} placeholder="مثال: -60" className="mt-1" />
                    </div>
                    <div>
                      <Label>مقاصد پیش‌فرض</Label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {PLATFORMS.map((p) => (
                          <label key={p.value} className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs ${newItemDestinations.includes(p.value) ? "border-tg-accent bg-tg-accent text-white" : "border-tg-border bg-tg-surface text-tg-secondary"}`}>
                            <input type="checkbox" className="sr-only" checked={newItemDestinations.includes(p.value)} onChange={() => setNewItemDestinations((prev) => prev.includes(p.value) ? prev.filter((x) => x !== p.value) : [...prev, p.value])} />
                            {p.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleAddItem(t.id)} disabled={saving}>افزودن</Button>
                    <Button size="sm" variant="secondary" onClick={() => setAddingItemFor(null)}>انصراف</Button>
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-tg-border p-4 text-center text-xs text-tg-secondary">آیتمی ثبت نشده.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it, idx) => {
                    const isItemEditing = editingItemId === it.id;
                    return (
                      <div key={it.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-tg-border p-3">
                        <div className="min-w-0 flex-1">
                          {isItemEditing ? (
                            <div className="space-y-2">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Input value={editItemName} onChange={(e) => setEditItemName(e.target.value)} placeholder="نام" />
                                <Input value={editItemKind} onChange={(e) => setEditItemKind(e.target.value)} placeholder="نوع" />
                                 <Input type="number" value={editItemOffset} onChange={(e) => setEditItemOffset(e.target.value)} placeholder="فاصله زمانی به دقیقه" />
                                <div className="flex flex-wrap gap-1">
                                  {PLATFORMS.map((p) => (
                                    <label key={p.value} className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-xs ${editItemDestinations.includes(p.value) ? "border-tg-accent bg-tg-accent text-white" : "border-tg-border bg-tg-surface"}`}>
                                      <input type="checkbox" className="sr-only" checked={editItemDestinations.includes(p.value)} onChange={() => setEditItemDestinations((prev) => prev.includes(p.value) ? prev.filter((x) => x !== p.value) : [...prev, p.value])} />
                                      {p.label}
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveItem(t.id, it.id)} disabled={saving}>ذخیره</Button>
                                <Button size="sm" variant="secondary" onClick={() => setEditingItemId(null)}>انصراف</Button>
                              </div>
                            </div>
                          ) : (
                            <>
                               <p className="text-sm font-medium text-tg-text">{idx + 1}. {it.name} {it.kind ? <span className="text-xs text-tg-secondary">({deliverableKindLabelFa(it.kind)})</span> : null}</p>
                               <p className="text-xs text-tg-secondary">فاصله زمانی: {it.dueOffsetMinutes != null ? `${it.dueOffsetMinutes} دقیقه` : "—"} · مقاصد: {it.destinations.length ? it.destinations.map((d) => platformLabelFa(d.platform)).join("، ") : "—"}</p>
                            </>
                          )}
                        </div>
                        {!isItemEditing && (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => handleReorder(t.id, items, idx, idx - 1)} aria-label="بالا" className="h-8 w-8 p-0"><ArrowUp className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" disabled={idx === items.length - 1} onClick={() => handleReorder(t.id, items, idx, idx + 1)} aria-label="پایین" className="h-8 w-8 p-0"><ArrowDown className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => startEditItem(it)} aria-label="ویرایش آیتم" className="h-8 w-8 p-0"><Edit2 className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(t.id, it.id)} aria-label="حذف آیتم" className="h-8 w-8 p-0 text-rose-600"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        );
      })}

      <ConfirmModal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && handleArchive(archiveTarget)}
        title="آرشیو الگو"
        description={
          archiveTarget
            ? (() => {
                const c = archiveTarget.instanceCount ?? archiveTarget.programCount ?? archiveTarget.usageCount ?? null;
                const has = typeof c === "number" && c > 0;
                return has
                  ? `این الگو ${c} نمونه فعال دارد. آرشیو کردن آن برنامه‌های قبلی را تغییر نمی‌دهد اما الگو از انتخاب‌های جدید پنهان می‌شود. آیا مطمئن هستید؟`
                  : `آیا از آرشیو الگوی «${archiveTarget.name}» مطمئن هستید؟ الگو از انتخاب‌های جدید پنهان خواهد شد.`;
              })()
            : ""
        }
        danger
        loading={saving}
      />
    </div>
  );
}
