"use client";

import { AlertTriangle, Check, Clock, Eye, Loader2, Calendar, X } from "lucide-react";
import { Button, StatusBadge } from "@/components/ui";
import { workflowStatusPresentation } from "@/lib/workflow/presentation";
import type { ProductionAction, PublicationAction } from "@/lib/workflow/types";

export type WorkflowActionKind = ProductionAction | PublicationAction;

export interface WorkflowStatusActionOption {
  action: WorkflowActionKind;
  label: string;
  requiresReason?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
}

interface Props {
  currentStatus: string;
  allowedActions: string[] | null | undefined;
  options: WorkflowStatusActionOption[];
  onAction: (action: WorkflowActionKind, requiresReason: boolean) => void;
  compact?: boolean;
  showCurrentLabel?: boolean;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  clock: Clock,
  loader: Loader2,
  eye: Eye,
  alert: AlertTriangle,
  check: Check,
  calendar: Calendar,
  x: X,
};

function statusIcon(status: string) {
  const pres = workflowStatusPresentation(status as never);
  const Icon = ICON_MAP[pres.icon] ?? Clock;
  return <Icon className="h-3.5 w-3.5" aria-hidden />;
}

function intentVariant(action: string): "primary" | "secondary" | "danger" | "ghost" {
  if (action === "cancel" || action === "suppress" || action === "request_changes") return "danger";
  if (action === "approve" || action === "publish_succeeded" || action === "manual_publish" || action === "restore") return "primary";
  return "secondary";
}

export function WorkflowStatusAction({
  currentStatus,
  allowedActions,
  options,
  onAction,
  compact = false,
  showCurrentLabel = true,
}: Props) {
  const pres = workflowStatusPresentation(currentStatus as never);
  const Icon = ICON_MAP[pres.icon] ?? Clock;

  // Disable invalid actions based on server-supplied allowed actions array.
  // If allowedActions is null/undefined, we fallback to showing options but disabled when server not ready.
  const hasAllowedList = Array.isArray(allowedActions);

  function isDisabled(opt: WorkflowStatusActionOption) {
    if (opt.disabled) return true;
    if (!hasAllowedList) return true;
    return !allowedActions!.includes(opt.action);
  }

  return (
    <div className="flex flex-col gap-2" dir="rtl">
      {showCurrentLabel && (
        <span
          className={`inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-medium ${
            pres.tone === "success"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : pres.tone === "danger"
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                : pres.tone === "warning"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : pres.tone === "info"
                    ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
                    : "bg-slate-500/10 text-slate-600 dark:text-slate-300"
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {pres.label}
          <span className="sr-only">وضعیت فعلی {pres.label}</span>
        </span>
      )}

      {!compact && hasAllowedList && allowedActions!.length === 0 && (
        <span className="text-xs text-tg-secondary">اقدامی در دسترس نیست.</span>
      )}

      <div className={`flex flex-wrap gap-1.5 ${compact ? "justify-start" : ""}`}>
        {options.map((opt) => {
          const disabled = isDisabled(opt);
          const variant = opt.variant ?? intentVariant(opt.action);
          return (
            <Button
              key={opt.action}
              size="sm"
              variant={variant}
              disabled={disabled}
              onClick={() => onAction(opt.action, Boolean(opt.requiresReason))}
              className="min-h-[32px] text-xs"
              title={opt.label}
              aria-label={opt.label}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>

      {/* Hidden current status badge for screen readers that rely on text, plus visual icon */}
      <span className="sr-only">وضعیت: {pres.label}</span>
    </div>
  );
}

// Helper to render publication status badge with icon+text (color is never only indicator)
export function PublicationStatusBadge({ status }: { status: string }) {
  const pres = workflowStatusPresentation(status as never);
  const Icon = ICON_MAP[pres.icon] ?? Clock;
  const toneClass =
    pres.tone === "success"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
      : pres.tone === "danger"
        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20"
        : pres.tone === "warning"
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20"
          : pres.tone === "info"
            ? "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"
            : "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {pres.label}
    </span>
  );
}

// Utility: map production actions to Persian labels
export const PRODUCTION_ACTION_LABELS: Record<ProductionAction, { label: string; requiresReason: boolean }> = {
  start: { label: "شروع", requiresReason: false },
  submit_review: { label: "ارسال برای بازبینی", requiresReason: false },
  request_changes: { label: "درخواست اصلاح", requiresReason: true },
  approve: { label: "تأیید", requiresReason: false },
  reopen: { label: "بازگشایی", requiresReason: true },
  cancel: { label: "لغو", requiresReason: true },
  restore: { label: "بازگردانی", requiresReason: true },
};

export const PUBLICATION_ACTION_LABELS: Record<PublicationAction, { label: string; requiresReason: boolean }> = {
  prepare: { label: "آماده‌سازی", requiresReason: false },
  schedule: { label: "زمان‌بندی", requiresReason: false },
  claim_publish: { label: "شروع انتشار", requiresReason: false },
  publish_succeeded: { label: "موفق", requiresReason: false },
  publish_failed: { label: "ناموفق", requiresReason: false },
  cancel_schedule: { label: "لغو زمان‌بندی", requiresReason: false },
  suppress: { label: "منتشر نشود", requiresReason: true },
  restore_suppressed: { label: "بازگردانی انتشار", requiresReason: true },
  manual_publish: { label: "ثبت دستی انتشار", requiresReason: true },
  override_terminal_status: { label: "اصلاح وضعیت پایانی", requiresReason: true },
};

export function buildProductionOptions(overrides?: Partial<Record<ProductionAction, string>>): WorkflowStatusActionOption[] {
  return (Object.keys(PRODUCTION_ACTION_LABELS) as ProductionAction[]).map((action) => ({
    action,
    label: overrides?.[action] ?? PRODUCTION_ACTION_LABELS[action].label,
    requiresReason: PRODUCTION_ACTION_LABELS[action].requiresReason,
  }));
}

export function buildPublicationOptions(): WorkflowStatusActionOption[] {
  return (Object.keys(PUBLICATION_ACTION_LABELS) as PublicationAction[]).map((action) => ({
    action,
    label: PUBLICATION_ACTION_LABELS[action].label,
    requiresReason: PUBLICATION_ACTION_LABELS[action].requiresReason,
  }));
}
