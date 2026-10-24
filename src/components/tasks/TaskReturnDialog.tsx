"use client";

import { useState } from "react";
import { Button, Label, Modal, Textarea } from "@/components/ui";
import { JOB_FUNCTION_LABELS_FA, type JobFunction } from "@/lib/job-functions";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import type { TaskDetailResponse } from "./types";

export default function TaskReturnDialog({
  open,
  task,
  onClose,
  onSaved,
  onConflictRefresh,
}: {
  open: boolean;
  task: TaskDetailResponse;
  onClose: () => void;
  onSaved: (detail: TaskDetailResponse) => void;
  onConflictRefresh?: () => void;
}) {
  const submitted = task.assignments.filter((assignment) => assignment.status === "submitted");
  const [selected, setSelected] = useState<JobFunction[]>([]);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  function toggleJob(job: JobFunction) {
    setSelected((previous) => (previous.includes(job) ? previous.filter((item) => item !== job) : [...previous, job]));
  }

  async function handleSubmit() {
    const missing: string[] = [];
    if (reason.trim().length === 0) missing.push("دلیل برگشت را وارد کنید.");
    if (selected.length === 0) missing.push("حداقل یک سمت را انتخاب کنید.");
    if (missing.length > 0) {
      setErrors(missing);
      return;
    }
    setErrors([]);
    setPending(true);
    try {
      const updated = await fetchWorkflowApi<TaskDetailResponse>(`/api/tasks/${encodeURIComponent(task.id)}/return`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: task.version, jobFunctions: selected, reason: reason.trim() }),
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      if (err instanceof WorkflowApiError && err.code === "VERSION_CONFLICT") {
        setErrors([err.message]);
        onConflictRefresh?.();
      } else if (err instanceof WorkflowApiError) {
        setErrors([err.message]);
      } else {
        setErrors(["خطای داخلی سرور رخ داد. دوباره تلاش کنید."]);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="برگشت برای اصلاح">
      <div className="flex flex-col gap-3">
        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-tg-secondary">سمت‌های تحویل‌شده</legend>
          {submitted.length === 0 ? (
            <p className="text-sm text-tg-secondary">سمت تحویل‌شده‌ای برای برگشت وجود ندارد</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {submitted.map((assignment) => (
                <label key={assignment.jobFunction} className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-tg-border px-3 py-2 text-sm text-tg-text">
                  <input
                    type="checkbox"
                    checked={selected.includes(assignment.jobFunction)}
                    onChange={() => toggleJob(assignment.jobFunction)}
                    aria-label={JOB_FUNCTION_LABELS_FA[assignment.jobFunction]}
                    className="h-4 w-4 rounded border-tg-border text-tg-accent"
                  />
                  {JOB_FUNCTION_LABELS_FA[assignment.jobFunction]}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <Label>
          دلیل برگشت
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 min-h-[88px]"
            aria-label="دلیل برگشت"
            maxLength={2000}
          />
        </Label>
        {errors.map((message) => (
          <p key={message} className="text-sm text-rose-600">
            {message}
          </p>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending} className="min-h-[44px]">
            انصراف
          </Button>
          <Button onClick={handleSubmit} disabled={pending} className="min-h-[44px]">
            {pending ? "در حال ارسال…" : "برگشت برای اصلاح"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

