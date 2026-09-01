"use client";

import { use, useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowRight, Link2, Link2Off, Calendar, AlertTriangle, User, Play, ExternalLink, Package, FileVideo } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, Modal, Skeleton } from "@/components/ui";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import { formatJalaliDateOnly, formatJalaliDateTime } from "@/lib/date/jalali";
import { workflowStatusPresentation } from "@/lib/workflow/presentation";
import { platformLabelFa, workflowActionLabelFa, UNKNOWN_LABEL_FA } from "@/lib/presentation-fa";
import { getVideoEmbedUrl } from "@/lib/media/video-embed";
import { WorkflowHistory, type WorkflowHistoryEntry } from "@/components/workflow/WorkflowHistory";
import { WorkflowReasonDialog } from "@/components/workflow/WorkflowReasonDialog";
import {
  WorkflowStatusAction,
  PublicationStatusBadge,
  PRODUCTION_ACTION_LABELS,
  PUBLICATION_ACTION_LABELS,
  type WorkflowActionKind,
} from "@/components/workflow/WorkflowStatusAction";

// ---------------------------------------------------------------------------
// Types (tolerant to partial server payloads)
// ---------------------------------------------------------------------------
interface MeResponse {
  id: string;
  role: string;
  permissions?: string[];
  allowedAccountIds?: string[] | null;
}

interface PublicationDetail {
  id: string;
  deliverableId?: string;
  platform: string; // telegram|youtube|instagram
  status: string;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  socialAccountId?: string | null;
  terminalOwner?: string | null;
  version?: number;
  allowedActions?: string[];
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  externalId?: string | null;
  permalink?: string | null;
}

interface DeliverableDetail {
  id: string;
  programId?: string;
  name: string;
  kind?: string | null;
  sortOrder?: number;
  productionStatus: string;
  assigneeUserId?: string | null;
  assigneeLabel?: string | null;
  assigneeName?: string | null;
  dueAt?: string | Date | null;
  notes?: string | null;
  contentId?: string | null;
  contentTitle?: string | null;
  version?: number;
  archivedAt?: string | Date | null;
  allowedActions?: string[];
  publications?: PublicationDetail[];
  connectedContent?: { id: string; title?: string } | null;
  /** Attached media from content room (raw token; playable via fileUrl). */
  fileRef?: string | null;
  fileUrl?: string | null;
}

interface ProgramDetail {
  id: string;
  title: string;
  seriesName?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
  dueAt?: string | Date | null;
  notes?: string | null;
  version?: number;
  progress?: { percent: number; completedUnits: number; totalUnits: number; complete: boolean; empty: boolean } | null;
  needsAttention?: boolean;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  archivedAt?: string | Date | null;
  /** Provenance: content_room programs carry a link back to their source product. */
  source?: string | null;
  sourceRef?: string | null;
  deliverables?: DeliverableDetail[];
}

// Generic server wrapper may return {program, deliverables} or direct object
type RawProgramResponse = ProgramDetail | { program: ProgramDetail; deliverables?: DeliverableDetail[] } | { data?: ProgramDetail } | null;

// History wrapper
type RawHistoryResponse = WorkflowHistoryEntry[] | { events: WorkflowHistoryEntry[] } | { items: WorkflowHistoryEntry[] } | null;

async function programFetcher(url: string): Promise<ProgramDetail | null> {
  const data = await fetchWorkflowApi<RawProgramResponse>(url);
  if (!data) return null;
  // handle wrapped shapes
  if (typeof data === "object" && data !== null && "program" in data) {
    const wrapped = data as { program: ProgramDetail; deliverables?: DeliverableDetail[] };
    const prog = wrapped.program;
    if (wrapped.deliverables && !prog.deliverables) prog.deliverables = wrapped.deliverables;
    return prog;
  }
  if (typeof data === "object" && data !== null && "data" in data) {
    const inner = (data as { data?: ProgramDetail }).data;
    if (inner) return inner;
  }
  return data as ProgramDetail;
}

async function historyFetcher(url: string): Promise<WorkflowHistoryEntry[]> {
  const data = await fetchWorkflowApi<RawHistoryResponse>(url);
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    if (Array.isArray((data as { events?: unknown }).events)) return (data as { events: WorkflowHistoryEntry[] }).events;
    if (Array.isArray((data as { items?: unknown }).items)) return (data as { items: WorkflowHistoryEntry[] }).items;
  }
  return [];
}

async function meFetcher(url: string): Promise<MeResponse | null> {
  try {
    return await fetchWorkflowApi<MeResponse>(url);
  } catch {
    return null;
  }
}

function platformLabel(p: string): string {
  return platformLabelFa(p);
}

function orderPublications(pubs: PublicationDetail[] | undefined): PublicationDetail[] {
  if (!pubs) return [];
  const order: Record<string, number> = { telegram: 0, youtube: 1, instagram: 2 };
  return [...pubs].sort((a, b) => (order[a.platform] ?? 9) - (order[b.platform] ?? 9));
}

export default function WorkflowProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // ---- Auth ----
  const { data: me } = useSWR<MeResponse | null>("/api/auth/me", meFetcher);
  const permissions = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const canActDeliverable = permissions.has("manage_programs") || permissions.has("update_assigned_deliverables");
  const canActPublication = permissions.has("manage_publications") || permissions.has("manage_programs");
  const canAct = canActDeliverable || canActPublication;
  const [publishedVideo, setPublishedVideo] = useState<{
    platform: string;
    permalink: string;
    embedUrl: string;
  } | null>(null);

  // ---- Program ----
  const {
    data: program,
    error: programError,
    isLoading: programLoading,
    mutate: mutateProgram,
  } = useSWR<ProgramDetail | null, Error>(id ? `/api/workflow/programs/${id}` : null, programFetcher);

  // Fallback retry for history key variations: try /api/workflow/history?entityId=id, fallback handled inside fetcher empty
  const historyKey = id ? `/api/workflow/history?entityType=workflow_program&entityId=${id}` : null;
  const {
    data: history,
    error: historyError,
    isLoading: historyLoading,
    mutate: mutateHistory,
  } = useSWR<WorkflowHistoryEntry[], Error>(historyKey, historyFetcher);

  // Secondary attempt if first returns empty and API uses different path: we rely on graceful empty
  // Deliverables already embedded; no separate fetch needed

  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "production" | "publication";
    deliverableId: string | null;
    publicationId: string | null;
    expectedVersion: number;
    action: WorkflowActionKind;
    requiresReason: boolean;
    title: string;
    initialReason: string;
    conflict: string | null;
    loading: boolean;
  }>({
    open: false,
    mode: "production",
    deliverableId: null,
    publicationId: null,
    expectedVersion: 1,
    action: "start",
    requiresReason: false,
    title: "",
    initialReason: "",
    conflict: null,
    loading: false,
  });

  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function openReasonDialog(opts: {
    mode: "production" | "publication";
    deliverableId?: string | null;
    publicationId?: string | null;
    expectedVersion: number;
    action: WorkflowActionKind;
    requiresReason: boolean;
    title: string;
  }) {
    setActionError(null);
    setDialog({
      open: true,
      mode: opts.mode,
      deliverableId: opts.deliverableId ?? null,
      publicationId: opts.publicationId ?? null,
      expectedVersion: opts.expectedVersion,
      action: opts.action,
      requiresReason: opts.requiresReason,
      title: opts.title,
      initialReason: dialog.initialReason && dialog.action === opts.action ? dialog.initialReason : "",
      conflict: null,
      loading: false,
    });
  }

  function closeDialog() {
    setDialog((d) => ({ ...d, open: false, loading: false, conflict: null }));
  }

  const handleTransition = useCallback(
    async (reason: string) => {
      const { mode, deliverableId, publicationId, expectedVersion, action, requiresReason } = dialog;

      if (requiresReason && !reason.trim()) {
        setDialog((d) => ({ ...d, conflict: null }));
        return;
      }

      setDialog((d) => ({ ...d, loading: true, conflict: null }));
      setActionError(null);

      try {
        if (mode === "production" && deliverableId) {
          const url = `/api/workflow/deliverables/${deliverableId}/transition`;
          await fetchWorkflowApi(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, expectedVersion, reason: reason || undefined }),
          });
        } else if (mode === "publication" && publicationId) {
          const url = `/api/workflow/publications/${publicationId}/transition`;
          await fetchWorkflowApi(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, expectedVersion, reason: reason || undefined }),
          });
        } else {
          throw new Error("شناسه موجودیت نامشخص است.");
        }

        setToast("عملیات با موفقیت انجام شد.");
        setTimeout(() => setToast(null), 3000);
        closeDialog();
        // refresh program + history
        await Promise.all([mutateProgram(), mutateHistory()]);
        // preserve reason cleared
        setDialog((d) => ({ ...d, initialReason: "" }));
      } catch (e) {
        const isConflict =
          e instanceof WorkflowApiError && e.status === 409
            ? true
            : e instanceof Error && (e.message.includes("409") || (e as { status?: number }).status === 409);

        if (isConflict) {
          // preserve entered reason, show persian conflict message, refresh
          setDialog((d) => ({
            ...d,
            loading: false,
            conflict: "اطلاعات توسط کاربر دیگری تغییر کرده است",
            initialReason: reason,
          }));
          await Promise.all([mutateProgram(), mutateHistory()]);
          setActionError("اطلاعات توسط کاربر دیگری تغییر کرده است. تازه‌سازی شد؛ دوباره تلاش کنید.");
          return;
        }

        const message = e instanceof WorkflowApiError ? e.message : e instanceof Error ? e.message : "خطا در انجام عملیات";
        setDialog((d) => ({ ...d, loading: false }));
        setActionError(message);
        // Keep dialog open so user can reapply with preserved reason
        setDialog((d) => ({ ...d, initialReason: reason, conflict: d.conflict }));
      }
    },
    [dialog, mutateHistory, mutateProgram],
  );

  function handleProductionAction(deliverable: DeliverableDetail, action: WorkflowActionKind, requiresReason: boolean) {
    const version = deliverable.version ?? 1;
    const label = (PRODUCTION_ACTION_LABELS as Record<string, { label: string }>)[action]?.label ?? workflowActionLabelFa(action);
    if (requiresReason) {
      openReasonDialog({
        mode: "production",
        deliverableId: deliverable.id,
        expectedVersion: version,
        action,
        requiresReason: true,
        title: `${label} — ${deliverable.name}`,
      });
      return;
    }
    // No reason required: call directly
    setDialog({
      open: false,
      mode: "production",
      deliverableId: deliverable.id,
      publicationId: null,
      expectedVersion: version,
      action,
      requiresReason: false,
      title: "",
      initialReason: "",
      conflict: null,
      loading: false,
    });
    // fire immediately
    (async () => {
      try {
        await fetchWorkflowApi(`/api/workflow/deliverables/${deliverable.id}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, expectedVersion: version }),
        });
        setToast("عملیات با موفقیت انجام شد.");
        setTimeout(() => setToast(null), 3000);
        await Promise.all([mutateProgram(), mutateHistory()]);
      } catch (e) {
        const isConflict = e instanceof WorkflowApiError && e.status === 409;
        if (isConflict) {
          setActionError("اطلاعات توسط کاربر دیگری تغییر کرده است");
          await Promise.all([mutateProgram(), mutateHistory()]);
        } else {
          setActionError(e instanceof WorkflowApiError ? e.message : e instanceof Error ? e.message : "خطا در انجام عملیات");
        }
      }
    })();
  }

  function handlePublicationAction(pub: PublicationDetail, action: WorkflowActionKind, requiresReason: boolean) {
    const version = pub.version ?? 1;
    const label = (PUBLICATION_ACTION_LABELS as Record<string, { label: string }>)[action]?.label ?? workflowActionLabelFa(action);
    if (requiresReason) {
      openReasonDialog({
        mode: "publication",
        publicationId: pub.id,
        expectedVersion: version,
        action,
        requiresReason: true,
        title: `${label} — ${platformLabel(pub.platform)}`,
      });
      return;
    }
    (async () => {
      try {
        await fetchWorkflowApi(`/api/workflow/publications/${pub.id}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, expectedVersion: version }),
        });
        setToast("عملیات با موفقیت انجام شد.");
        setTimeout(() => setToast(null), 3000);
        await Promise.all([mutateProgram(), mutateHistory()]);
      } catch (e) {
        const isConflict = e instanceof WorkflowApiError && e.status === 409;
        if (isConflict) {
          setActionError("اطلاعات توسط کاربر دیگری تغییر کرده است");
          await Promise.all([mutateProgram(), mutateHistory()]);
        } else {
          setActionError(e instanceof WorkflowApiError ? e.message : e instanceof Error ? e.message : "خطا در انجام عملیات");
        }
      }
    })();
  }

  // ---- Derived stats ----
  const deliverables = program?.deliverables ?? [];
  const isNotFound = programError instanceof WorkflowApiError && programError.status === 404;
  const isForbidden = programError instanceof WorkflowApiError && (programError.status === 403 || programError.status === 401);

  if (programLoading) {
    return (
      <div className="space-y-6" dir="rtl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (programError) {
    if (isNotFound) {
      return (
        <div className="space-y-6" dir="rtl">
          <Link href="/workflow" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
            <ArrowRight className="h-4 w-4" />
            بازگشت به اتاق انتشار
          </Link>
          <EmptyState title="برنامه یافت نشد" description="شناسه برنامه نامعتبر است یا برنامه حذف شده است." />
        </div>
      );
    }
    if (isForbidden) {
      return (
        <div className="space-y-6" dir="rtl">
          <Link href="/workflow" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
            <ArrowRight className="h-4 w-4" />
            بازگشت به اتاق انتشار
          </Link>
          <ErrorState message="دسترسی ندارید. برای مشاهده این برنامه به مجوز مشاهده گردش کار نیاز است." />
        </div>
      );
    }
    // Gracefully handle missing API (phase 1 not yet deployed)
    const isMissingApi =
      programError instanceof WorkflowApiError && (programError.status === 404 || programError.status === 500);
    return (
      <div className="space-y-6" dir="rtl">
        <Link href="/workflow" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
          <ArrowRight className="h-4 w-4" />
          بازگشت به اتاق انتشار
        </Link>
        <ErrorState
          message={
            isMissingApi
              ? "جزئیات برنامه هنوز در دسترس نیست."
              : programError.message
          }
        />
        <Button variant="secondary" onClick={() => mutateProgram()} className="min-h-[44px]">
          تلاش دوباره
        </Button>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="space-y-6" dir="rtl">
        <EmptyState title="برنامه‌ای یافت نشد" />
      </div>
    );
  }

  const progress = program.progress;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Breadcrumb */}
      <Link href="/workflow" className="inline-flex items-center gap-2 text-sm text-tg-accent hover:underline">
        <ArrowRight className="h-4 w-4" />
        بازگشت به اتاق انتشار
      </Link>

      {/* Header */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-tg-text">{program.title}</h1>
            {program.seriesName && <p className="mt-1 text-sm text-tg-secondary">{program.seriesName}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-tg-secondary">
              {program.dueAt && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-tg-hover px-2.5 py-1">
                  <Calendar className="h-3.5 w-3.5" />
                  موعد: {formatJalaliDateOnly(program.dueAt)}
                </span>
              )}
              {program.updatedAt && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-tg-hover px-2.5 py-1">
                  به‌روزرسانی: {formatJalaliDateTime(program.updatedAt)}
                </span>
              )}
              {progress && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-tg-accent/10 px-2.5 py-1 font-medium text-tg-accent">
                  پیشرفت: {progress.empty ? "بدون خروجی" : progress.complete ? "تکمیل" : `${progress.percent}٪ (${progress.completedUnits}/${progress.totalUnits})`}
                </span>
              )}
              {program.needsAttention && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  نیازمند توجه
                </span>
              )}
              {program.source === "content_room" && program.sourceRef && (
                <Link
                  href={`/content-room/${program.sourceRef}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 font-medium text-sky-700 hover:underline dark:text-sky-400"
                >
                  <Package className="h-3.5 w-3.5" />
                  منبع: اتاق محتوا
                </Link>
              )}
            </div>
            {program.notes && <p className="mt-3 text-sm leading-relaxed text-tg-text/80">{program.notes}</p>}
          </div>
        </div>

        {/* Permission hint */}
        {!canAct && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            دسترسی تغییر وضعیت ندارید؛ نمایش فقط خواندنی است. (نیازمند manage_programs یا update_assigned_deliverables/manage_publications)
          </p>
        )}

        {actionError && (
          <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {actionError}
          </div>
        )}
        {toast && (
          <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {toast}
          </div>
        )}
      </Card>

      {/* Deliverables */}
      <Card className="space-y-4 p-0">
        <div className="border-b border-tg-border px-5 py-4">
          <h2 className="text-sm font-bold text-tg-text">خروجی‌ها</h2>
          <p className="text-xs text-tg-secondary">نام، مسئول، موعد، وضعیت تولید، سه مقصد و اتصال محتوا · اقدام سریع با کنترل دسترسی</p>
        </div>

        {deliverables.length === 0 ? (
          <div className="p-6">
            <EmptyState title="خروجی ثبت نشده" description="برای این برنامه هنوز خروجی ثبت نشده است. خروجی‌های این برنامه پس از اتصال API نمایش داده می‌شوند." />
          </div>
        ) : (
          <div className="divide-y divide-tg-border">
            {deliverables.map((d) => {
              const pubs = orderPublications(d.publications);
              const connected = Boolean(d.contentId || d.connectedContent);
              const pres = workflowStatusPresentation(d.productionStatus as never);
              return (
                <div key={d.id} className="space-y-3 px-5 py-4">
                  {/* Row header */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-tg-text">{d.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tg-secondary">
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                           {d.assigneeLabel ?? d.assigneeName ?? (d.assigneeUserId ? UNKNOWN_LABEL_FA : "بدون مسئول")}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {d.dueAt ? formatJalaliDateOnly(d.dueAt) : "بدون موعد"}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            connected
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-slate-500/10 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {connected ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                          {connected ? (d.contentTitle ?? d.connectedContent?.title ?? "متصل به محتوا") : "بدون اتصال"}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
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
                        تولید: {pres.label}
                      </span>
                    </div>
                  </div>

                  {/* Attached media file (from content room) */}
                  {d.fileUrl && (
                    <div className="flex items-center gap-2 rounded-lg bg-sky-500/5 px-3 py-2 text-xs">
                      <FileVideo className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                      <span className="text-tg-secondary">فایل پیوست‌شده از اتاق محتوا:</span>
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate font-medium text-tg-accent hover:underline"
                      >
                        پخش / دانلود
                      </a>
                    </div>
                  )}

                  {/* Production quick actions */}
                  <div className="rounded-lg border border-tg-border bg-tg-hover/20 p-3">
                    <p className="mb-2 text-xs font-semibold text-tg-secondary">وضعیت تولید</p>
                    {canAct ? (
                      <WorkflowStatusAction
                        currentStatus={d.productionStatus}
                        allowedActions={d.allowedActions}
                        options={[
                          { action: "start", label: PRODUCTION_ACTION_LABELS.start.label, requiresReason: false },
                          { action: "submit_review", label: PRODUCTION_ACTION_LABELS.submit_review.label, requiresReason: false },
                          { action: "request_changes", label: PRODUCTION_ACTION_LABELS.request_changes.label, requiresReason: true, variant: "danger" },
                          { action: "approve", label: PRODUCTION_ACTION_LABELS.approve.label, requiresReason: false, variant: "primary" },
                          { action: "reopen", label: PRODUCTION_ACTION_LABELS.reopen.label, requiresReason: true },
                          { action: "cancel", label: PRODUCTION_ACTION_LABELS.cancel.label, requiresReason: true, variant: "danger" },
                          { action: "restore", label: PRODUCTION_ACTION_LABELS.restore.label, requiresReason: true },
                        ]}
                        onAction={(action, requiresReason) => handleProductionAction(d, action, requiresReason)}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-tg-secondary">
                        تغییر وضعیت تولید نیازمند دسترسی است.
                      </span>
                    )}
                  </div>

                  {/* Publications per platform */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(["telegram", "youtube", "instagram"] as const).map((platform) => {
                      const pub = pubs.find((p) => p.platform === platform);
                      if (!pub) {
                        return (
                          <div key={platform} className="rounded-lg border border-dashed border-tg-border p-3">
                            <p className="text-xs font-semibold text-tg-secondary">{platformLabel(platform)}</p>
                            <p className="mt-1 text-xs text-tg-secondary">مقصد ثبت نشده</p>
                          </div>
                        );
                      }
                      const embedUrl = getVideoEmbedUrl(pub.platform, pub.permalink);
                      return (
                        <div key={pub.id} className="rounded-lg border border-tg-border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold text-tg-secondary">{platformLabel(pub.platform)}</p>
                            <PublicationStatusBadge status={pub.status} />
                          </div>
                          {pub.scheduledAt && <p className="text-xs text-tg-secondary">زمان‌بندی: {formatJalaliDateTime(pub.scheduledAt)}</p>}
                           {pub.publishedAt && <p className="text-xs text-tg-secondary">انتشار: {formatJalaliDateTime(pub.publishedAt)}</p>}
                           {pub.lastErrorMessage && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{pub.lastErrorMessage}</p>}
                           {pub.permalink && (
                             <div className="mt-2 flex flex-wrap gap-2">
                               {embedUrl && (
                                 <Button
                                   size="sm"
                                   variant="secondary"
                                   className="min-h-[36px] text-xs"
                                   onClick={() => setPublishedVideo({ platform: pub.platform, permalink: pub.permalink!, embedUrl })}
                                 >
                                   <Play className="h-3.5 w-3.5" />
                                   پخش داخل سامانه
                                 </Button>
                               )}
                               <a href={pub.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-tg-accent hover:underline">
                                 <ExternalLink className="h-3.5 w-3.5" />
                                 مشاهده در {platformLabel(pub.platform)}
                               </a>
                             </div>
                           )}
                          <div className="mt-3">
                            {canActPublication ? (
                              <WorkflowStatusAction
                                currentStatus={pub.status}
                                allowedActions={pub.allowedActions}
                                compact
                                showCurrentLabel={false}
                                options={[
                                  { action: "schedule", label: PUBLICATION_ACTION_LABELS.schedule.label, requiresReason: false },
                                  { action: "cancel_schedule", label: PUBLICATION_ACTION_LABELS.cancel_schedule.label, requiresReason: false },
                                  { action: "suppress", label: PUBLICATION_ACTION_LABELS.suppress.label, requiresReason: true, variant: "danger" },
                                  { action: "restore_suppressed", label: PUBLICATION_ACTION_LABELS.restore_suppressed.label, requiresReason: true },
                                  { action: "manual_publish", label: PUBLICATION_ACTION_LABELS.manual_publish.label, requiresReason: true, variant: "primary" },
                                  { action: "override_terminal_status", label: "اصلاح پایانی", requiresReason: true, variant: "danger" },
                                ]}
                                onAction={(action, requiresReason) => handlePublicationAction(pub, action, requiresReason)}
                              />
                            ) : (
                              <span className="text-xs text-tg-secondary">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={publishedVideo !== null}
        onClose={() => setPublishedVideo(null)}
        title={publishedVideo ? `پخش ویدئو از ${platformLabel(publishedVideo.platform)}` : "پخش ویدئو"}
        footer={publishedVideo ? (
          <>
            <Button variant="secondary" onClick={() => setPublishedVideo(null)}>بستن</Button>
            <a href={publishedVideo.permalink} target="_blank" rel="noopener noreferrer">
              <Button>مشاهده در {platformLabel(publishedVideo.platform)}</Button>
            </a>
          </>
        ) : undefined}
      >
        {publishedVideo && (
          <div className="overflow-hidden rounded-lg bg-black">
            <iframe
              src={publishedVideo.embedUrl}
              title={`ویدئوی منتشرشده در ${platformLabel(publishedVideo.platform)}`}
              className={publishedVideo.platform === "instagram" ? "mx-auto aspect-[9/16] max-h-[70vh] w-full max-w-md" : "aspect-video w-full"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
      </Modal>

      {/* History */}
      <WorkflowHistory
        entries={history ?? []}
        isLoading={historyLoading}
        error={
          historyError
            ? historyError instanceof WorkflowApiError && historyError.status === 404
              ? "تاریخچه هنوز در دسترس نیست."
              : historyError.message
            : null
        }
        onRetry={() => mutateHistory()}
      />

      <WorkflowReasonDialog
        open={dialog.open}
        onClose={closeDialog}
        onConfirm={handleTransition}
        title={dialog.title || "ثبت دلیل"}
        description={
          dialog.requiresReason ? "برای این اقدام ارائه دلیل الزامی است. دلیل در تاریخچه ثبت می‌شود." : "در صورت نیاز توضیح را وارد کنید."
        }
        requiresReason={dialog.requiresReason}
        initialReason={dialog.initialReason}
        loading={dialog.loading}
        conflictMessage={dialog.conflict}
      />
    </div>
  );
}
