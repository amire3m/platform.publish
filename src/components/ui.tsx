"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useEffect } from "react";
import { AlertTriangle, FolderOpen } from "lucide-react";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const variants: Record<string, string> = {
    primary: "bg-tg-accent text-tg-accent-fg hover:bg-tg-accent-hover",
    secondary: "bg-tg-hover text-tg-text hover:brightness-95 dark:hover:brightness-125",
    danger: "bg-rose-500 text-white hover:bg-rose-600",
    ghost: "bg-transparent text-tg-secondary hover:bg-tg-hover hover:text-tg-text",
  };
  return <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-tg-border bg-tg-surface px-3 py-2 text-sm text-tg-text outline-none transition placeholder:text-tg-secondary/70 focus:border-tg-accent focus:ring-2 focus:ring-tg-accent/25 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-tg-border bg-tg-surface px-3 py-2 text-sm text-tg-text outline-none transition placeholder:text-tg-secondary/70 focus:border-tg-accent focus:ring-2 focus:ring-tg-accent/25 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-tg-border bg-tg-surface px-3 py-2 text-sm text-tg-text outline-none transition focus:border-tg-accent focus:ring-2 focus:ring-tg-accent/25 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold text-tg-secondary">{children}</label>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-tg-border bg-tg-surface p-5 ${className}`}>{children}</div>
  );
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "پیش‌نویس", className: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  uploaded: { label: "آپلودشده", className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  in_review: { label: "در بررسی", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  changes_requested: { label: "نیازمند اصلاح", className: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  approved: { label: "تأییدشده", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  scheduled: { label: "زمان‌بندی‌شده", className: "bg-tg-accent/10 text-tg-accent" },
  publishing: { label: "در حال انتشار", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  published: { label: "منتشرشده", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  rejected: { label: "رد شده", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  cancelled: { label: "لغوشده", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  failed: { label: "ناموفق", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  archived: { label: "آرشیوشده", className: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400" },
  pending: { label: "در انتظار", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  mock: { label: "حالت آزمایشی", className: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400" },
  connected: { label: "متصل", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  disconnected: { label: "متصل نیست", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  error: { label: "خطا", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  ok: { label: "سالم", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  degraded: { label: "ناپایدار", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  offline: { label: "آفلاین", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] ?? { label: status, className: "bg-slate-500/10 text-slate-600 dark:text-slate-400" };
  return <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-tg-border p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tg-hover text-tg-secondary">
        <FolderOpen className="h-6 w-6" />
      </div>
      <p className="font-semibold text-tg-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-tg-secondary">{description}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-tg-border bg-tg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <h3 className="mb-4 text-lg font-bold text-tg-text">{title}</h3>
        <div className="text-sm text-tg-text/80">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>
            {loading ? "در حال انجام..." : "تأیید"}
          </Button>
        </>
      }
    >
      {description}
    </Modal>
  );
}
