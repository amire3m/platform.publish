"use client";

import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import useSWR from "swr";
import { Button, Card, EmptyState, Input, Label, Modal, Select, Skeleton, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/providers";
import { ROLE_LABELS_FA, type Role } from "@/lib/permissions";
import { VISIBLE_CHANNEL_GROUPS } from "@/lib/channels";
import { fetchWorkflowApi } from "@/lib/workflow/client";
import { formatJalaliDateTime } from "@/lib/date/jalali";
import { roleLabelFa } from "@/lib/presentation-fa";
import { JOB_FUNCTIONS, JOB_FUNCTION_LABELS_FA, type JobFunction } from "@/lib/job-functions";

interface UserRow {
  id: string;
  telegramId: string;
  name: string;
  username: string | null;
  phone?: string | null;
  role: Role;
  active: boolean;
  allowedActions: string[];
  allowedChannels?: string[];
  allowedAccountIds?: string[];
  jobFunctions?: string[];
  isOwnerProtected: boolean;
  createdAt: string;
}

interface MeResponse {
  id: string;
  role: Role;
  permissions: string[];
}

const MATRIX_PERMISSIONS: { key: string; label: string }[] = [
  { key: "view_content_room", label: "مشاهده اتاق محتوا" },
  { key: "manage_content_room", label: "مدیریت اتاق محتوا" },
  { key: "view_workflow", label: "مشاهده گردش کار" },
  { key: "manage_programs", label: "مدیریت برنامه‌ها" },
  { key: "manage_publications", label: "مدیریت انتشار" },
  { key: "view_mail", label: "مشاهده ایمیل" },
  { key: "manage_mail", label: "مدیریت ایمیل" },
  { key: "view_dashboard", label: "مشاهده داشبورد" },
];

const MANAGER_DISABLED = new Set(["manage_content_room", "manage_programs", "manage_publications", "manage_mail"]);

export default function UsersPage() {
  const { data, mutate, isLoading, error } = useSWR<UserRow[]>("/api/users", fetchWorkflowApi<UserRow[]>);
  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetchWorkflowApi<MeResponse>);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [telegramId, setTelegramId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [newJobs, setNewJobs] = useState<JobFunction[]>([]);

  const rows = data ?? [];
  // drafts: map userId -> { allowedActions, allowedChannels, jobFunctions, saving }
  const [drafts, setDrafts] = useState<Record<string, { allowedActions: string[]; allowedChannels: string[]; jobFunctions: string[] }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!rows.length) return;
    setDrafts((prev) => {
      const next: Record<string, { allowedActions: string[]; allowedChannels: string[]; jobFunctions: string[] }> = { ...prev };
      for (const u of rows) {
        if (!next[u.id]) {
          next[u.id] = {
            allowedActions: u.allowedActions ?? [],
            allowedChannels: (u.allowedChannels as string[]) ?? [],
            jobFunctions: (u.jobFunctions as string[]) ?? [],
          };
        }
      }
      return next;
    });
  }, [rows]);

  const isOwner = me?.role === "owner";
  const isManager = me?.role === "manager";

  function isPermDisabled(user: UserRow, permKey: string): boolean {
    if (!isOwner && user.isOwnerProtected) return true;
    if (isManager && MANAGER_LIMITED(user, permKey)) return true;
    if (!isOwner && !isManager) return true; // viewer etc cannot edit
    return false;
  }
  function MANAGER_LIMITED(_user: UserRow, permKey: string): boolean {
    return isManager && MANAGER_LIMITED_SET.has(permKey);
  }
  const MANAGER_LIMITED_SET = MANAGER_DISABLED;

  function isChannelDisabled(user: UserRow): boolean {
    if (!isOwner && user.isOwnerProtected) return true;
    if (!isOwner && !isManager) return true;
    return false;
  }

  async function createUser() {
    try {
      await fetchWorkflowApi("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telegramId, name, role, jobFunctions: newJobs }),
      });
      showToast("کاربر ایجاد شد.", "success");
      setOpen(false);
      setTelegramId("");
      setName("");
      setNewJobs([]);
      mutate();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function toggleActive(u: UserRow) {
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !u.active }),
      });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      mutate();
      showToast(u.active ? "کاربر غیرفعال شد." : "کاربر فعال شد.", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function changeRole(u: UserRow, role: Role) {
    if (role === u.role) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      mutate();
      showToast(`نقش ${u.name} به «${roleLabelFa(role)}» تغییر کرد.`, "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function removeUser(u: UserRow) {
    if (!window.confirm(`کاربر «${u.name}» حذف (غیرفعال) شود؟ سوابق ثبت‌شده او (مثل تیک‌ها) با نامش باقی می‌ماند.`)) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      mutate();
      showToast(`کاربر ${u.name} حذف شد.`, "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function hardRemoveUser(u: UserRow) {
    if (!window.confirm(`«${u.name}» برای همیشه از سامانه پاک شود؟ این عمل قابل بازگشت نیست (سوابق با شناسه می‌ماند، نه نام).`)) return;
    if (!window.confirm(`تأیید نهایی: حذف دائمی «${u.name}»؟`)) return;
    try {
      const res = await fetch(`/api/users/${u.id}/hard`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      mutate();
      showToast(`کاربر ${u.name} دائماً حذف شد.`, "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function impersonate(u: UserRow) {
    if (!window.confirm(`به‌عنوان «${u.name}» وارد شوید؟ همه دسترسی‌ها دقیقاً مثل او خواهد بود (سقف ۶۰ دقیقه).`)) return;
    try {
      const res = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: u.id }),
      });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      window.location.href = "/dashboard";
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editTelegramId, setEditTelegramId] = useState("");
  const [editActive, setEditActive] = useState(true);

  function openEdit(u: UserRow) {
    setEditing(u);
    setEditName(u.name ?? "");
    setEditUsername(u.username ?? "");
    setEditPhone((u as unknown as { phone?: string }).phone ?? "");
    setEditTelegramId(u.telegramId ?? "");
    setEditActive(u.active);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editName.trim() || !editTelegramId.trim()) {
      showToast("نام و شناسه تلگرام الزامی است.", "error");
      return;
    }
    try {
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          username: editUsername.trim() || null,
          phone: editPhone.trim() || null,
          telegramId: editTelegramId.trim(),
          active: editActive,
        }),
      });
      const json = await res.json();
      if (!json.ok) return showToast(json.error, "error");
      setEditing(null);
      mutate();
      showToast("مشخصات کاربر به‌روزرسانی شد.", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function saveRow(userId: string) {
    const draft = drafts[userId];
    if (!draft) return;
    setSaving((s) => ({ ...s, [userId]: true }));
    try {
      await fetchWorkflowApi(`/api/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowedActions: draft.allowedActions, allowedChannels: draft.allowedChannels, jobFunctions: draft.jobFunctions }),
      });
      showToast("دسترسی‌ها به‌روزرسانی شد.", "success");
      mutate();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving((s) => ({ ...s, [userId]: false }));
    }
  }

  function togglePerm(userId: string, perm: string, checked: boolean) {
    setDrafts((prev) => {
      const cur = prev[userId] ?? { allowedActions: [], allowedChannels: [], jobFunctions: [] };
      const nextActions = checked ? [...new Set([...cur.allowedActions, perm])] : cur.allowedActions.filter((x) => x !== perm);
      return { ...prev, [userId]: { ...cur, allowedActions: nextActions } };
    });
  }

  function toggleJob(userId: string, job: JobFunction, checked: boolean) {
    setDrafts((prev) => {
      const cur = prev[userId] ?? { allowedActions: [], allowedChannels: [], jobFunctions: [] };
      const next = checked ? [...new Set([...cur.jobFunctions, job])] : cur.jobFunctions.filter((x) => x !== job);
      return { ...prev, [userId]: { ...cur, jobFunctions: next } };
    });
  }

  function toggleChannel(userId: string, channelId: string, checked: boolean) {
    setDrafts((prev) => {
      const cur = prev[userId] ?? { allowedActions: [], allowedChannels: [], jobFunctions: [] };
      const next = checked ? [...new Set([...cur.allowedChannels, channelId])] : cur.allowedChannels.filter((x) => x !== channelId);
      return { ...prev, [userId]: { ...cur, allowedChannels: next } };
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6" dir="rtl">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6" dir="rtl">
        <h1 className="text-xl font-bold text-tg-text">کاربران و تیم</h1>
        <p className="text-sm text-rose-600">خطا در دریافت کاربران: {(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">کاربران و تیم</h1>
          <p className="text-sm text-tg-secondary">مدیریت اعضای تیم، ماتریس دسترسی‌ها و کانال‌های مجاز</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          افزودن کاربر
        </Button>
      </div>

      {rows.length === 0 && <EmptyState title="کاربری یافت نشد" />}

      {/* Team access matrix */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-tg-border">
          <h2 className="font-semibold text-tg-text">ماتریس دسترسی تیم</h2>
          <p className="text-xs text-tg-secondary mt-1">
            سطرها: کاربران — ستون‌ها: دسترسی‌ها (۸) — کانال‌های مجاز (۶) با انتخاب چندگانه. مالک به همه دسترسی دارد، مدیر محدود است.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="ماتریس دسترسی تیم">
            <thead className="border-b border-tg-border bg-tg-hover text-right text-xs text-tg-secondary">
              <tr>
                <th scope="col" className="p-3 min-w-[160px]">کاربر</th>
                {MATRIX_PERMISSIONS.map((p) => (
                  <th key={p.key} scope="col" className="p-2 text-center min-w-[90px]">
                    <span className="block text-[11px] leading-tight">{p.label}</span>
                  </th>
                ))}
                <th scope="col" className="p-3 min-w-[200px]">کانال‌های مجاز</th>
                <th scope="col" className="p-3 min-w-[150px]">سمت شغلی</th>
                <th scope="col" className="p-3">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const draft = drafts[u.id] ?? { allowedActions: u.allowedActions ?? [], allowedChannels: (u.allowedChannels as string[]) ?? [], jobFunctions: (u.jobFunctions as string[]) ?? [] };
                const disabledAll = !isOwner && u.isOwnerProtected;
                return (
                  <tr key={u.id} className="border-b border-tg-border last:border-0">
                    <th scope="row" className="p-3 text-right font-medium whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className="text-tg-text">{u.name} {u.isOwnerProtected && <span className="text-xs text-amber-500">(مالک)</span>}</span>
                        <span className="text-[11px] text-tg-secondary">{u.telegramId}</span>
                        <Select
                          value={u.role}
                          disabled={!isOwner || u.isOwnerProtected}
                          onChange={(e) => changeRole(u, e.target.value as Role)}
                          aria-label={`نقش ${u.name}`}
                          className="max-w-[140px] text-xs"
                        >
                          {Object.entries(ROLE_LABELS_FA).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                        <span className="mt-1"><StatusBadge status={u.active ? "connected" : "disconnected"} /></span>
                      </div>
                    </th>
                    {MATRIX_PERMISSIONS.map((perm) => {
                      const checked = draft.allowedActions.includes(perm.key);
                      const disabled = isPermDisabled(u, perm.key);
                      return (
                        <td key={perm.key} className="p-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${u.name} - ${perm.label}`}
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => togglePerm(u.id, perm.key, e.target.checked)}
                            className="h-4 w-4 rounded border-tg-border text-tg-accent focus:ring-tg-accent disabled:opacity-40"
                          />
                        </td>
                      );
                    })}
                    <td className="p-2">
                      <fieldset disabled={isChannelDisabled(u)} className="space-y-2" aria-label={`کانال‌های مجاز ${u.name}`}>
                        {VISIBLE_CHANNEL_GROUPS.map((group) => (
                          <div key={group.id}>
                            <p className="mb-1 text-[10px] font-semibold text-tg-secondary">{group.labelFa}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.channels.map((ch) => {
                                const checked = draft.allowedChannels.includes(ch.id);
                                return (
                                  <label key={ch.id} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-tg-border px-2 py-1 text-xs has-[input:checked]:border-tg-accent has-[input:checked]:bg-tg-accent-soft has-[input:disabled]:opacity-40">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={isChannelDisabled(u)}
                                      onChange={(e) => toggleChannel(u.id, ch.id, e.target.checked)}
                                      aria-label={`${u.name} - کانال ${ch.labelFa}`}
                                      className="h-3 w-3"
                                    />
                                    {ch.labelFa}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </fieldset>
                    </td>
                    <td className="p-2">
                      <fieldset disabled={isChannelDisabled(u)} className="flex flex-col gap-1.5" aria-label={`سمت‌های ${u.name}`}>
                        {JOB_FUNCTIONS.map((job) => {
                          const checked = draft.jobFunctions.includes(job);
                          return (
                            <label key={job} className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-tg-border px-2 py-1 text-xs has-[input:checked]:border-tg-accent has-[input:checked]:bg-tg-accent-soft has-[input:disabled]:opacity-40">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isChannelDisabled(u)}
                                onChange={(e) => toggleJob(u.id, job, e.target.checked)}
                                aria-label={`${u.name} - ${JOB_FUNCTION_LABELS_FA[job]}`}
                                className="h-3 w-3"
                              />
                              {JOB_FUNCTION_LABELS_FA[job]}
                            </label>
                          );
                        })}
                      </fieldset>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <div className="flex flex-col gap-1.5">
                        <Button size="sm" onClick={() => saveRow(u.id)} disabled={saving[u.id] || disabledAll || (!isOwner && !isManager)} aria-label={`ذخیره دسترسی‌های ${u.name}`}>
                          <Save className="h-3.5 w-3.5" />
                          {saving[u.id] ? "در حال ذخیره..." : "ذخیره"}
                        </Button>
                        {(isOwner || isManager) && !disabledAll && (
                          <Button size="sm" variant="secondary" onClick={() => openEdit(u)} aria-label={`ویرایش ${u.name}`}>
                            ویرایش
                          </Button>
                        )}
                        {!u.isOwnerProtected && (
                          <Button size="sm" variant={u.active ? "danger" : "primary"} onClick={() => toggleActive(u)}>
                            {u.active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                          </Button>
                        )}
                        {isOwner && !u.isOwnerProtected && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => impersonate(u)} aria-label={`ورود به‌عنوان ${u.name}`}>
                              ورود به‌عنوان
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => removeUser(u)} aria-label={`حذف ${u.name}`}>
                              حذف
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => hardRemoveUser(u)} aria-label={`حذف دائمی ${u.name}`}>
                              حذف دائمی
                            </Button>
                          </>
                        )}
                        <span className="text-[11px] text-tg-secondary">{formatJalaliDateTime(u.createdAt)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isOwner && (
          <p className="p-3 text-xs text-amber-600 bg-amber-500/10 border-t border-amber-500/20">
            شما با نقش مدیر وارد شده‌اید؛ دسترسی‌های مدیریتی حساس و ویرایش مالک محدود است.
          </p>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="افزودن کاربر جدید">
        <div className="space-y-3">
          <div>
            <Label>شناسه عددی تلگرام</Label>
            <Input value={telegramId} onChange={(e) => setTelegramId(e.target.value)} placeholder="مثلاً 123456789" />
          </div>
          <div>
            <Label>نام</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>نقش</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {Object.entries(ROLE_LABELS_FA).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>سمت شغلی (چندگانه)</Label>
            <div className="flex flex-wrap gap-1.5">
              {JOB_FUNCTIONS.map((job) => (
                <label key={job} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-tg-border px-2 py-1 text-xs has-[input:checked]:border-tg-accent has-[input:checked]:bg-tg-accent-soft">
                  <input
                    type="checkbox"
                    checked={newJobs.includes(job)}
                    onChange={(e) =>
                      setNewJobs((prev) => (e.target.checked ? [...new Set([...prev, job])] : prev.filter((x) => x !== job)))
                    }
                    aria-label={JOB_FUNCTION_LABELS_FA[job]}
                    className="h-3 w-3"
                  />
                  {JOB_FUNCTION_LABELS_FA[job]}
                </label>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-tg-secondary/80">
            توجه: اعضای گروه Telegram ممکن است بتوانند تاپیک‌های دیگر را در خود Telegram مشاهده کنند؛ محدودیت دسترسی واقعی همیشه در همین پنل و API اعمال می‌شود.
          </p>
          <Button className="w-full" onClick={createUser} disabled={!telegramId || !name}>
            ایجاد کاربر
          </Button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `ویرایش ${editing.name}` : ""}>
        <div className="space-y-3">
          <div>
            <Label>نام</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div>
            <Label>شناسه عددی تلگرام (هویت ورود)</Label>
            <Input value={editTelegramId} onChange={(e) => setEditTelegramId(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label>یوزرنیم تلگرام</Label>
            <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="بدون @" dir="ltr" />
          </div>
          <div>
            <Label>تلفن</Label>
            <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} dir="ltr" />
          </div>
          <label className="flex items-center gap-2 text-sm text-tg-text">
            <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="h-4 w-4" />
            حساب فعال
          </label>
          <Button className="w-full" onClick={saveEdit} disabled={!editName.trim() || !editTelegramId.trim()}>
            ذخیره تغییرات
          </Button>
        </div>
      </Modal>
    </div>
  );
}
