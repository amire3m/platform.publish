"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { JalaliDateTimePicker } from "@/components/JalaliDateTimePicker";
import { JOB_FUNCTIONS, JOB_FUNCTION_LABELS_FA, type JobFunction } from "@/lib/job-functions";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import type { TaskDetailResponse } from "./types";

interface ProductRow {
  id: string;
  title: string;
  status?: string;
  archivedAt?: string | null;
}

interface PartRow {
  id: string;
  partNumber: number;
  isActive?: boolean;
}

function parseProducts(data: unknown): ProductRow[] {
  const rows = Array.isArray(data) ? data : [];
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map((row) => ({
      id: String(row.id ?? ""),
      title: String(row.title ?? row.id ?? ""),
      status: typeof row.status === "string" ? row.status : undefined,
      archivedAt: typeof row.archivedAt === "string" ? row.archivedAt : null,
    }))
    .filter((row) => row.id.length > 0 && row.status !== "archived" && !row.archivedAt);
}

function parseParts(data: unknown): PartRow[] {
  const root = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(root.parts) ? root.parts : Array.isArray(root.product) ? [] : [];
  const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
  return list
    .filter((row) => typeof row === "object" && row !== null)
    .map((row) => ({
      id: String(row.id ?? ""),
      partNumber: Number(row.partNumber ?? 0),
      isActive: row.isActive !== false,
    }))
    .filter((row) => row.id.length > 0 && row.isActive);
}

export default function TaskEditorDialog({
  open,
  mode,
  task,
  onClose,
  onSaved,
  onConflictRefresh,
}: {
  open: boolean;
  mode: "create" | "edit";
  task?: TaskDetailResponse | null;
  onClose: () => void;
  onSaved: (detail: TaskDetailResponse) => void;
  onConflictRefresh?: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [jobFunctions, setJobFunctions] = useState<JobFunction[]>(
    task ? task.assignments.map((assignment) => assignment.jobFunction) : [],
  );
  const [useDueDate, setUseDueDate] = useState(task?.dueAt != null);
  const [dueAt, setDueAt] = useState<string | null>(task?.dueAt ?? null);
  const [productId, setProductId] = useState(task?.productId ?? "");
  const [partId, setPartId] = useState(task?.partId ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { data: productsData } = useSWR<unknown>(open ? "/api/content-room/products" : null, fetchWorkflowApi);
  const { data: productDetail } = useSWR<unknown>(
    open && productId ? `/api/content-room/products/${encodeURIComponent(productId)}` : null,
    fetchWorkflowApi,
  );
  const products = parseProducts(productsData);
  const parts = parseParts(productDetail);

  function toggleJob(job: JobFunction) {
    setJobFunctions((previous) => (previous.includes(job) ? previous.filter((item) => item !== job) : [...previous, job]));
  }

  async function handleSubmit() {
    setFormError(null);
    if (title.trim().length === 0) {
      setFormError("عنوان کار را وارد کنید.");
      return;
    }
    if (jobFunctions.length === 0) {
      setFormError("حداقل یک سمت را انتخاب کنید.");
      return;
    }
    setPending(true);
    try {
      if (mode === "create") {
        const created = await fetchWorkflowApi<TaskDetailResponse>("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() === "" ? null : description.trim(),
            dueAt: useDueDate ? dueAt : null,
            productId: productId === "" ? null : productId,
            partId: partId === "" ? null : partId,
            jobFunctions,
          }),
        });
        onSaved(created);
        onClose();
      } else if (task) {
        const updated = await fetchWorkflowApi<TaskDetailResponse>(`/api/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: task.version,
            title: title.trim(),
            description: description.trim() === "" ? null : description.trim(),
            dueAt: useDueDate ? dueAt : null,
            productId: productId === "" ? null : productId,
            partId: partId === "" ? null : partId,
            jobFunctions,
          }),
        });
        onSaved(updated);
        onClose();
      }
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
    <Modal open={open} onClose={onClose} title={mode === "create" ? "کار جدید" : "ویرایش کار"}>
      <div className="flex flex-col gap-3">
        <Label>
          عنوان
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 min-h-[44px]"
            aria-label="عنوان"
            maxLength={200}
          />
        </Label>
        <Label>
          توضیح
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 min-h-[88px]"
            aria-label="توضیح"
            maxLength={4000}
          />
        </Label>
        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-tg-secondary">سمت‌ها</legend>
          <div className="flex flex-wrap gap-2">
            {JOB_FUNCTIONS.map((job) => (
              <label key={job} className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-tg-border px-3 py-2 text-sm text-tg-text">
                <input type="checkbox" checked={jobFunctions.includes(job)} onChange={() => toggleJob(job)} aria-label={JOB_FUNCTION_LABELS_FA[job]} className="h-4 w-4 rounded border-tg-border text-tg-accent" />
                {JOB_FUNCTION_LABELS_FA[job]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-tg-text">
          <input type="checkbox" checked={useDueDate} onChange={(event) => setUseDueDate(event.target.checked)} aria-label="تعیین موعد" className="h-4 w-4 rounded border-tg-border text-tg-accent" />
          تعیین موعد
        </label>
        {useDueDate && <JalaliDateTimePicker onChange={(utcIso) => setDueAt(utcIso)} initialUtc={dueAt} />}
        <Label>
          محصول
          <Select
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              setPartId("");
            }}
            className="mt-1 min-h-[44px]"
            aria-label="محصول"
          >
            <option value="">بدون محصول</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.title}
              </option>
            ))}
          </Select>
        </Label>
        {productId !== "" && parts.length > 0 && (
          <Label>
            قسمت
            <Select value={partId} onChange={(event) => setPartId(event.target.value)} className="mt-1 min-h-[44px]" aria-label="قسمت">
              <option value="">بدون قسمت</option>
              {parts.map((part) => (
                <option key={part.id} value={part.id}>
                  قسمت {part.partNumber}
                </option>
              ))}
            </Select>
          </Label>
        )}
        {formError && <p className="text-sm text-rose-600">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending} className="min-h-[44px]">
            انصراف
          </Button>
          <Button onClick={handleSubmit} disabled={pending} className="min-h-[44px]">
            {pending ? "در حال ارسال…" : mode === "create" ? "ساخت کار" : "ذخیره تغییرات"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

