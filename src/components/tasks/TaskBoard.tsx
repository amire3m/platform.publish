"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { Button } from "@/components/ui";
import { fetchWorkflowApi, type WorkflowApiError } from "@/lib/workflow/client";
import { startOfTehranDayUtc } from "@/lib/date/jalali";
import TaskColumn, { type TaskColumnState } from "./TaskColumn";
import TaskDetailPanel from "./TaskDetailPanel";
import TaskEditorDialog from "./TaskEditorDialog";
import TaskFilters, { type ProductOption } from "./TaskFilters";
import {
  DEFAULT_TASK_FILTERS,
  TASK_COLUMN_LABELS,
  type TaskBoardFilters,
  type TaskColumnKey,
  type TaskPageResponse,
} from "./types";

const PAGE_LIMIT = 20;

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => (typeof window === "undefined" ? false : window.innerWidth < 768));
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mobile;
}

function buildListKey(column: TaskColumnKey, filters: TaskBoardFilters) {
  return (pageIndex: number, previous: TaskPageResponse | null): string | null => {
    if (previous && !previous.nextCursor) return null;
    const params = new URLSearchParams({ column, limit: String(PAGE_LIMIT) });
    if (previous?.nextCursor) params.set("cursor", previous.nextCursor);
    const search = filters.search.trim();
    if (search) params.set("search", search);
    if (filters.jobFunction) params.set("jobFunction", filters.jobFunction);
    if (filters.due) params.set("due", filters.due);
    if (filters.productId) params.set("productId", filters.productId);
    if (column === "completed") {
      if (filters.completedMode === "all") {
        params.set("completedFrom", "2000-01-01T00:00:00.000Z");
      } else if (filters.completedMode === "custom") {
        if (filters.completedFrom) {
          params.set("completedFrom", startOfTehranDayUtc(new Date(`${filters.completedFrom}T00:00:00`)).toISOString());
        }
        if (filters.completedTo) {
          const start = startOfTehranDayUtc(new Date(`${filters.completedTo}T00:00:00`));
          params.set("completedTo", new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString());
        }
      }
    }
    return `/api/tasks?${params.toString()}`;
  };
}

function useTaskColumn(column: TaskColumnKey, filters: TaskBoardFilters, enabled = true): TaskColumnState {
  const getKey = useCallback(
    (pageIndex: number, previous: TaskPageResponse | null) => {
      if (!enabled) return null;
      return buildListKey(column, filters)(pageIndex, previous);
    },
    [column, filters, enabled],
  );
  const { data, error, isLoading, size, setSize, mutate } = useSWRInfinite<TaskPageResponse, WorkflowApiError>(
    getKey,
    fetchWorkflowApi,
  );
  const items = useMemo(() => (data ?? []).flatMap((page) => page.items), [data]);
  const last = (data ?? [])[(data ?? []).length - 1];
  return {
    items,
    total: last?.total ?? 0,
    isLoading,
    error,
    hasMore: !!last?.nextCursor,
    onLoadMore: () => void setSize(size + 1),
    onRetry: () => void mutate(),
  };
}

function isFilteredState(filters: TaskBoardFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.jobFunction !== "" ||
    filters.due !== "" ||
    filters.productId !== "" ||
    filters.completedMode !== "recent"
  );
}

const ACTIVE_COLUMNS: TaskColumnKey[] = ["open", "awaiting_approval", "completed"];

export default function TaskBoard({ initialTaskId }: { initialTaskId: string | null }) {
  const [filters, setFilters] = useState<TaskBoardFilters>(DEFAULT_TASK_FILTERS);
  const [activeTab, setActiveTab] = useState<TaskColumnKey>("open");
  const [createOpen, setCreateOpen] = useState(false);
  const { mutate: mutateAll } = useSWRConfig();
  const refreshLists = useCallback(
    () => mutateAll((key) => typeof key === "string" && key.startsWith("/api/tasks")),
    [mutateAll],
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId);
  const [lastInitialTaskId, setLastInitialTaskId] = useState<string | null>(initialTaskId);
  if (initialTaskId !== lastInitialTaskId) {
    setLastInitialTaskId(initialTaskId);
    setSelectedTaskId(initialTaskId);
  }
  const [showArchived, setShowArchived] = useState(false);
  const isMobile = useIsMobile();

  const patchFilters = useCallback((patch: Partial<TaskBoardFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
  }, []);
  const clearFilters = useCallback(() => setFilters(DEFAULT_TASK_FILTERS), []);
  const isFiltered = isFilteredState(filters);

  const open = useTaskColumn("open", filters, !showArchived);
  const awaiting = useTaskColumn("awaiting_approval", filters, !showArchived);
  const completed = useTaskColumn("completed", filters, !showArchived);
  const archived = useTaskColumn("archived", filters, showArchived);

  const states: Record<TaskColumnKey, TaskColumnState> = useMemo(
    () => ({ open, awaiting_approval: awaiting, completed, archived }),
    [open, awaiting, completed, archived],
  );

  const { data: currentUser } = useSWR<{ role: string }>("/api/auth/me", fetchWorkflowApi);
  const privileged = currentUser?.role === "owner";

  const { data: productsData } = useSWR<unknown>("/api/content-room/products", fetchWorkflowApi);
  const products: ProductOption[] = useMemo(() => {
    const rows = Array.isArray(productsData) ? productsData : [];
    return rows
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map((row) => ({ id: String(row.id ?? ""), title: String(row.title ?? row.id ?? "") }))
      .filter((row) => row.id.length > 0);
  }, [productsData]);

  const renderColumn = (column: TaskColumnKey) => (
    <section key={column} role="region" aria-label={TASK_COLUMN_LABELS[column]} hidden={isMobile && activeTab !== column}>
      <TaskColumn
        column={column}
        state={states[column]}
        selectedId={selectedTaskId}
        onSelect={setSelectedTaskId}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
      />
    </section>
  );

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-tg-text">کارها</h1>
        <div className="flex flex-wrap items-center gap-2">
          {privileged && !showArchived && (
            <Button onClick={() => setCreateOpen(true)} className="min-h-[44px]">
              کار جدید
            </Button>
          )}
          {privileged && (
            <Button variant="secondary" onClick={() => setShowArchived((value) => !value)} className="min-h-[44px]">
              {showArchived ? "بازگشت به برد" : "نمایش بایگانی"}
            </Button>
          )}
        </div>
      </div>

      <TaskFilters
        filters={filters}
        onChange={patchFilters}
        onClear={clearFilters}
        isFiltered={isFiltered}
        products={products}
      />

      {showArchived ? (
        renderColumn("archived")
      ) : isMobile ? (
        <div className="flex min-h-0 flex-col gap-3">
          <div role="tablist" aria-label="وضعیت کارها" className="flex gap-1 rounded-xl border border-tg-border bg-tg-surface p-1">
            {ACTIVE_COLUMNS.map((column) => (
              <button
                key={column}
                type="button"
                role="tab"
                aria-selected={activeTab === column}
                onClick={() => setActiveTab(column)}
                className={
                  "min-h-[44px] flex-1 rounded-lg text-sm font-semibold transition-colors " +
                  (activeTab === column ? "bg-tg-accent text-white" : "text-tg-secondary hover:text-tg-text")
                }
              >
                {TASK_COLUMN_LABELS[column]}
              </button>
            ))}
          </div>
          {ACTIVE_COLUMNS.map((column) => renderColumn(column))}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {ACTIVE_COLUMNS.map((column) => renderColumn(column))}
        </div>
      )}

      {selectedTaskId && <TaskDetailPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />}

      {createOpen && (
        <TaskEditorDialog
          open
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={(detail) => {
            setCreateOpen(false);
            void refreshLists();
            setSelectedTaskId(detail.id);
          }}
        />
      )}
    </div>
  );
}

