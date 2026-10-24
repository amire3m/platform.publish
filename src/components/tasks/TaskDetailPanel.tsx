"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { JOB_FUNCTION_LABELS_FA, type JobFunction } from "@/lib/job-functions";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/date/jalali";
import { Button, ConfirmModal, Modal, Skeleton } from "@/components/ui";
import { isTaskOverdue } from "./TaskCard";
import { TASK_COLUMN_LABELS, type TaskDetailResponse } from "./types";
import TaskEditorDialog from "./TaskEditorDialog";
import TaskSubmitDialog from "./TaskSubmitDialog";
import TaskReturnDialog from "./TaskReturnDialog";

const HISTORY_ACTION_LABELS: Record<string, string> = {
  task_created: "ایجاد شد",
  task_updated: "ویرایش شد",
  task_assignment_added: "سمت اضافه شد",
  task_assignment_removed: "سمت حذف شد",
  task_assignment_submitted: "تحویل ثبت شد",
  task_returned: "برگشت داده شد",
  task_assignment_returned: "تحویل برگشت داده شد",
  task_approved: "تأیید شد",
  task_archived: "بایگانی شد",
};

const ACCESS_CHANGED_MESSAGE = "دسترسی به این کار تغییر کرده است.";

function isAccessLost(error: unknown): boolean {
  return error instanceof WorkflowApiError && (error.status === 404 || error.code === "NOT_FOUND");
}

export default function TaskDetailPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const detailKey = `/api/tasks/${encodeURIComponent(taskId)}`;
  const { data, error, isLoading, mutate: mutateDetail } = useSWR<TaskDetailResponse>(detailKey, fetchWorkflowApi);
  const { mutate: mutateAll } = useSWRConfig();

  const [editOpen, setEditOpen] = useState(false);
  const [submitJob, setSubmitJob] = useState<JobFunction | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState(false);

  const refreshLists = () => mutateAll((key) => typeof key === "string" && key.startsWith("/api/tasks"));
  const refreshDetail = () => mutateDetail();

  async function handleSaved(updated: TaskDetailResponse) {
    await mutateDetail(updated, { revalidate: false });
    await refreshLists();
  }

  async function runOwnerAction(path: "approve" | "archive", closeConfirm: () => void) {
    if (!data) return;
    setActionError(null);
    setPendingAction(true);
    try {
      const updated = await fetchWorkflowApi<TaskDetailResponse>(`/api/tasks/${encodeURIComponent(taskId)}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: data.version }),
      });
      closeConfirm();
      await handleSaved(updated);
    } catch (err) {
      if (err instanceof WorkflowApiError && (err.status === 404 || err.code === "NOT_FOUND")) {
        setActionError(ACCESS_CHANGED_MESSAGE);
      } else if (err instanceof WorkflowApiError) {
        setActionError(err.message);
      } else {
        setActionError("خطای داخلی سرور رخ داد. دوباره تلاش کنید.");
      }
    } finally {
      setPendingAction(false);
    }
  }

  if (error && isAccessLost(error)) {
    return (
      <Modal open onClose={onClose} title="جزئیات کار">
        <p className="text-sm text-tg-text">{ACCESS_CHANGED_MESSAGE}</p>
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose} className="min-h-[44px]">
            بستن
          </Button>
        </div>
      </Modal>
    );
  }

  const submittable = (data?.assignments ?? []).filter((assignment) => assignment.canSubmit);
  const submittedCount = (data?.assignments ?? []).filter((assignment) => assignment.status === "submitted").length;

  return (
    <>
      <Modal open onClose={onClose} title={data?.title ?? "جزئیات کار"}>
        {isLoading && (
          <div className="flex flex-col gap-2" aria-label="در حال بارگذاری">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {error && !isAccessLost(error) && <p className="text-sm text-rose-600">خطا در دریافت جزئیات کار</p>}
        {data && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-tg-secondary">
              <span>{TASK_COLUMN_LABELS[data.status as keyof typeof TASK_COLUMN_LABELS] ?? data.status}</span>
              {data.dueAt && <span>{formatJalaliDateTime(data.dueAt)}</span>}
              {isTaskOverdue(data) && <span className="font-semibold text-rose-500">موعد گذشته</span>}
              {(data.productTitle || data.partNumber != null) && (
                <span>
                  {data.productTitle}
                  {data.partNumber != null ? ` · قسمت ${toPersianDigits(data.partNumber)}` : ""}
                </span>
              )}
            </div>

            {data.description && <p className="whitespace-pre-wrap text-sm text-tg-text">{data.description}</p>}

            <div>
              <h4 className="mb-2 text-sm font-bold text-tg-text">تحویل سمت‌ها</h4>
              <ul className="flex flex-col gap-2">
                {data.assignments.map((assignment) => (
                  <li key={assignment.jobFunction} className="rounded-lg border border-tg-border p-3">
                    <p className="text-sm font-semibold text-tg-text">
                      {JOB_FUNCTION_LABELS_FA[assignment.jobFunction]} ·{" "}
                      {assignment.status === "submitted" ? "ارسال‌شده" : "باز"}
                    </p>
                    {assignment.submissionNote && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-tg-text/80">{assignment.submissionNote}</p>
                    )}
                    {assignment.submissionUrl && (
                      <a
                        href={assignment.submissionUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-block text-xs text-tg-accent hover:underline"
                      >
                        مشاهده تحویل
                      </a>
                    )}
                    {(assignment.submittedByName || assignment.submittedAt) && (
                      <p className="mt-1 text-xs text-tg-secondary">
                        {assignment.submittedByName}
                        {assignment.submittedAt ? ` · ${formatJalaliDateTime(assignment.submittedAt)}` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold text-tg-text">تاریخچه</h4>
              {data.recentHistory.length === 0 ? (
                <p className="text-xs text-tg-secondary">تاریخچه‌ای ثبت نشده است</p>
              ) : (
                <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                  {data.recentHistory.map((entry) => (
                    <li key={entry.id} className="text-xs text-tg-secondary">
                      <span className="font-semibold text-tg-text">{HISTORY_ACTION_LABELS[entry.action] ?? entry.action}</span>
                      {entry.actorName ? ` · ${entry.actorName}` : ""}
                      {entry.reason ? ` · دلیل: ${entry.reason}` : ""} · {formatJalaliDateTime(entry.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(data.capabilities.canEdit ||
              submittable.length > 0 ||
              (data.capabilities.canReturn && submittedCount > 0) ||
              data.capabilities.canApprove ||
              data.capabilities.canArchive) && (
              <div className="flex flex-wrap gap-2 border-t border-tg-border pt-4">
                {data.capabilities.canEdit && (
                  <Button variant="secondary" onClick={() => setEditOpen(true)} className="min-h-[44px]">
                    ویرایش
                  </Button>
                )}
                {submittable.map((assignment) => (
                  <Button key={assignment.jobFunction} onClick={() => setSubmitJob(assignment.jobFunction)} className="min-h-[44px]">
                    تحویل {JOB_FUNCTION_LABELS_FA[assignment.jobFunction]}
                  </Button>
                ))}
                {data.capabilities.canReturn && submittedCount > 0 && (
                  <Button variant="secondary" onClick={() => setReturnOpen(true)} className="min-h-[44px]">
                    برگشت برای اصلاح
                  </Button>
                )}
                {data.capabilities.canApprove && (
                  <Button onClick={() => setApproveOpen(true)} className="min-h-[44px]">
                    تأیید نهایی
                  </Button>
                )}
                {data.capabilities.canArchive && (
                  <Button variant="secondary" onClick={() => setArchiveOpen(true)} className="min-h-[44px]">
                    بایگانی
                  </Button>
                )}
              </div>
            )}

            {actionError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
                <p className="text-sm text-rose-600">{actionError}</p>
                {actionError === ACCESS_CHANGED_MESSAGE && (
                  <Button variant="secondary" onClick={onClose} className="mt-2 min-h-[44px]">
                    بستن
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {data && editOpen && (
        <TaskEditorDialog
          open
          mode="edit"
          task={data}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setEditOpen(false);
            void handleSaved(updated);
          }}
          onConflictRefresh={() => void refreshDetail()}
        />
      )}
      {data && submitJob && (
        <TaskSubmitDialog
          open
          task={data}
          jobFunction={submitJob}
          onClose={() => setSubmitJob(null)}
          onSaved={(updated) => {
            setSubmitJob(null);
            void handleSaved(updated);
          }}
          onConflictRefresh={() => void refreshDetail()}
        />
      )}
      {data && returnOpen && (
        <TaskReturnDialog
          open
          task={data}
          onClose={() => setReturnOpen(false)}
          onSaved={(updated) => {
            setReturnOpen(false);
            void handleSaved(updated);
          }}
          onConflictRefresh={() => void refreshDetail()}
        />
      )}
      <ConfirmModal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={() => void runOwnerAction("approve", () => setApproveOpen(false))}
        title="تأیید نهایی"
        description="این کار به‌صورت نهایی تأیید و تکمیل می‌شود. ادامه می‌دهید؟"
        loading={pendingAction}
        confirmLabel="تأیید نهایی"
      />
      <ConfirmModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => void runOwnerAction("archive", () => setArchiveOpen(false))}
        title="بایگانی کار"
        description="این کار از برد خارج و بایگانی می‌شود. تاریخچه آن حفظ می‌ماند. ادامه می‌دهید؟"
        danger
        loading={pendingAction}
        confirmLabel="بایگانی"
      />
    </>
  );
}

