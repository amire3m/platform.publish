"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import useSWR from "swr";
import { Button, Card, EmptyState, Input, Label, Modal, Select, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/providers";
import { ALL_PERMISSIONS, ROLE_LABELS_FA, type Role } from "@/lib/permissions";
import { formatJalaliDateTime } from "@/lib/date/jalali";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface UserRow {
  id: string;
  telegramId: string;
  name: string;
  username: string | null;
  role: Role;
  active: boolean;
  allowedActions: string[];
  isOwnerProtected: boolean;
  createdAt: string;
}

const PERMISSION_LABELS_FA: Record<string, string> = {
  view_content: "مشاهده محتوا",
  upload_content: "آپلود محتوا",
  edit_content: "ویرایش محتوا",
  delete_content: "حذف محتوا",
  submit_for_review: "ارسال برای بررسی",
  approve_content: "تأیید محتوا",
  schedule_content: "زمان‌بندی محتوا",
  publish_now: "انتشار فوری",
  manage_accounts: "مدیریت حساب‌ها",
  manage_users: "مدیریت کاربران",
  view_analytics: "مشاهده آنالیز",
  export_data: "خروجی گرفتن از داده",
  manage_settings: "مدیریت تنظیمات",
};

export default function UsersPage() {
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; data: UserRow[] }>("/api/users", fetcher);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [telegramId, setTelegramId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [permOpenFor, setPermOpenFor] = useState<UserRow | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const rows = data?.data ?? [];

  async function createUser() {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ telegramId, name, role }),
    });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast("کاربر ایجاد شد.", "success");
    setOpen(false);
    setTelegramId("");
    setName("");
    mutate();
  }

  async function toggleActive(u: UserRow) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    mutate();
  }

  async function savePermissions() {
    if (!permOpenFor) return;
    const res = await fetch(`/api/users/${permOpenFor.id}/permissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowedActions: selectedPerms }),
    });
    const json = await res.json();
    if (!json.ok) return showToast(json.error, "error");
    showToast("دسترسی‌ها به‌روزرسانی شد.", "success");
    setPermOpenFor(null);
    mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">کاربران و تیم</h1>
          <p className="text-sm text-tg-secondary">مدیریت اعضای تیم و سطح دسترسی هرکدام</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          افزودن کاربر
        </Button>
      </div>

      {!isLoading && rows.length === 0 && <EmptyState title="کاربری یافت نشد" />}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-tg-border text-right text-xs text-tg-secondary">
            <tr>
              <th className="p-3">نام</th>
              <th className="p-3">شناسه تلگرام</th>
              <th className="p-3">نقش</th>
              <th className="p-3">وضعیت</th>
              <th className="p-3">تاریخ عضویت</th>
              <th className="p-3">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-tg-border last:border-0">
                <td className="p-3 font-medium">
                  {u.name} {u.isOwnerProtected && <span className="text-xs text-amber-500">(مالک)</span>}
                </td>
                <td className="p-3 text-xs text-tg-secondary">{u.telegramId}</td>
                <td className="p-3">{ROLE_LABELS_FA[u.role] ?? u.role}</td>
                <td className="p-3">
                  <StatusBadge status={u.active ? "connected" : "disconnected"} />
                </td>
                <td className="p-3 text-xs text-tg-secondary">{formatJalaliDateTime(u.createdAt)}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setPermOpenFor(u);
                        setSelectedPerms(u.allowedActions ?? []);
                      }}
                    >
                      دسترسی‌های ویژه
                    </Button>
                    {!u.isOwnerProtected && (
                      <Button size="sm" variant={u.active ? "danger" : "primary"} onClick={() => toggleActive(u)}>
                        {u.active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <p className="text-[11px] text-tg-secondary/80">
            توجه: اعضای گروه تلگرام ممکن است بتوانند Topicهای دیگر را در خود تلگرام مشاهده کنند؛ محدودیت دسترسی واقعی همیشه در همین پنل و API اعمال می‌شود.
          </p>
          <Button className="w-full" onClick={createUser} disabled={!telegramId || !name}>
            ایجاد کاربر
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(permOpenFor)} onClose={() => setPermOpenFor(null)} title={`دسترسی‌های ویژه: ${permOpenFor?.name ?? ""}`}>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {ALL_PERMISSIONS.map((p) => (
            <label key={p} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedPerms.includes(p)}
                onChange={(e) =>
                  setSelectedPerms((prev) => (e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)))
                }
              />
              {PERMISSION_LABELS_FA[p] ?? p}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPermOpenFor(null)}>
            انصراف
          </Button>
          <Button onClick={savePermissions}>ذخیره</Button>
        </div>
      </Modal>
    </div>
  );
}
