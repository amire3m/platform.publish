"use client";

import { useState } from "react";
import { Button, Input, Label, Modal, Textarea } from "@/components/ui";
import { JOB_FUNCTION_LABELS_FA, type JobFunction } from "@/lib/job-functions";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import type { TaskDetailResponse } from "./types";

function isValidUrl(value: string): boolean {
  if (value === "") return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function TaskSubmitDialog({
  open,
  task,
  jobFunction,
  onClose,
  onSaved,
  onConflictRefresh,
}: {
  open: boolean;
  task: TaskDetailResponse;
  jobFunction: JobFunction;
  onClose: () => void;
  onSaved: (detail: TaskDetailResponse) => void;
  onConflictRefresh?: () => void;
}) {
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setFormError(null);
    if (!isValidUrl(url.trim())) {
      setFormError("لینک تحویل باید با http یا https شروع شود.");
      return;
    }
    setPending(true);
    try {
      const updated = await fetchWorkflowApi<TaskDetailResponse>(
        `/api/tasks/${encodeURIComponent(task.id)}/assignments/${encodeURIComponent(jobFunction)}/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: task.version,
            submissionNote: note.trim() === "" ? null : note.trim(),
            submissionUrl: url.trim() === "" ? null : url.trim(),
          }),
        },
      );
      onSaved(updated);
      onClose();
    } catch (err) {
      if (err instanceof WorkflowApiError && err.code === "VERSION_CONFLICT") {
        setFormError(err.message);
        onConflictRefresh?.();
      } else if (err instanceof WorkflowApiError) {
        setFormError(err.message);
      } else {
        setFormError("خطای داخلی سرور رخ داد. دوباره تلاش کنید.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`تحویل سمت ${JOB_FUNCTION_LABELS_FA[jobFunction]}`}>
      <div className="flex flex-col gap-3">
        <Label>
          توضیح تحویل
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 min-h-[88px]"
            aria-label="توضیح تحویل"
            maxLength={4000}
          />
        </Label>
        <Label>
          لینک تحویل
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="mt-1 min-h-[44px] text-left"
            dir="ltr"
            aria-label="لینک تحویل"
            placeholder="https://…"
            maxLength={2048}
          />
        </Label>
        {formError && <p className="text-sm text-rose-600">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending} className="min-h-[44px]">
            انصراف
          </Button>
          <Button onClick={handleSubmit} disabled={pending} className="min-h-[44px]">
            {pending ? "در حال ارسال…" : "ارسال برای تأیید"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

