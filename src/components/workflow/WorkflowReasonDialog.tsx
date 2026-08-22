"use client";

import { useEffect, useState } from "react";
import { Button, Modal, Textarea, Label } from "@/components/ui";

export interface WorkflowReasonDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  title: string;
  description?: string;
  requiresReason?: boolean;
  initialReason?: string;
  loading?: boolean;
  conflictMessage?: string | null;
}

export function WorkflowReasonDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  requiresReason = true,
  initialReason = "",
  loading = false,
  conflictMessage,
}: WorkflowReasonDialogProps) {
  const [reason, setReason] = useState(initialReason);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(initialReason);
      setTouched(false);
    }
  }, [open, initialReason]);

  const needsReason = requiresReason;
  const isInvalid = needsReason && !reason.trim();

  function handleConfirm() {
    setTouched(true);
    if (isInvalid) return;
    onConfirm(reason.trim());
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading} className="min-h-[44px]">
            انصراف
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={loading || (needsReason && !reason.trim())}
            className="min-h-[44px]"
          >
            {loading ? "در حال انجام..." : "تأیید"}
          </Button>
        </>
      }
    >
      <div className="space-y-4" dir="rtl">
        {description && <p className="text-sm text-tg-secondary">{description}</p>}
        <div>
          <Label>
            <span className="flex items-center gap-1">
              دلیل
              {needsReason && <span className="text-rose-500">*</span>}
            </span>
          </Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={needsReason ? "دلیل این اقدام را بنویسید..." : "توضیح اختیاری..."}
            rows={3}
            className="mt-1 min-h-[88px] resize-y"
            aria-required={needsReason}
            aria-invalid={touched && isInvalid ? true : undefined}
          />
          {touched && isInvalid && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="alert">
              ارائه دلیل برای این اقدام الزامی است.
            </p>
          )}
        </div>
        {conflictMessage && (
          <div
            role="alert"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
          >
            {conflictMessage}
          </div>
        )}
      </div>
    </Modal>
  );
}
