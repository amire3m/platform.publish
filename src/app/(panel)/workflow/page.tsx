"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { fetchWorkflowApi, WorkflowApiError } from "@/lib/workflow/client";
import { filterPrograms } from "@/components/workflow/room-model";
import type { WorkflowProgramSummary } from "@/components/workflow/types";
import { WorkflowSummary } from "@/components/workflow/WorkflowSummary";
import { WorkflowFilters, type WorkflowFiltersValue } from "@/components/workflow/WorkflowFilters";
import { WorkflowMatrix } from "@/components/workflow/WorkflowMatrix";
import { WorkflowCards } from "@/components/workflow/WorkflowCards";

type ProgramsData = WorkflowProgramSummary[] | { programs: WorkflowProgramSummary[] };

function normalizePrograms(data: unknown): WorkflowProgramSummary[] {
  if (Array.isArray(data)) return data as WorkflowProgramSummary[];
  if (data && typeof data === "object" && Array.isArray((data as { programs?: unknown }).programs)) {
    return (data as { programs: WorkflowProgramSummary[] }).programs;
  }
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: WorkflowProgramSummary[] }).items;
  }
  return [];
}

async function workflowFetcher(url: string): Promise<WorkflowProgramSummary[]> {
  const data = await fetchWorkflowApi<ProgramsData>(url);
  return normalizePrograms(data);
}

export default function WorkflowRoomPage() {
  const { data: rawData, error, isLoading, mutate } = useSWR<WorkflowProgramSummary[], Error>(
    "/api/workflow/programs",
    workflowFetcher,
  );

  const [filters, setFilters] = useState<WorkflowFiltersValue>({
    query: "",
    attentionOnly: false,
    stage: "",
    assignee: "",
    platform: "",
    dueWindow: "",
  });

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const programs = rawData ?? [];

  const filtered = useMemo(() => {
    let result = filterPrograms(programs, { query: filters.query, attentionOnly: filters.attentionOnly });

    // stage / platform are placeholders until server provides per-platform breakdown
    // keep filtering pure; these filters are UI-only for now.

    if (filters.assignee.trim()) {
      const q = filters.assignee.trim().toLowerCase();
      result = result.filter((p) => {
        const title = (p.title ?? "").toLowerCase();
        const series = (p.seriesName ?? "").toLowerCase();
        return title.includes(q) || series.includes(q);
      });
    }

    if (filters.dueWindow) {
      const now = Date.now();
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      if (filters.dueWindow === "this_week") {
        result = result.filter((p) => {
          if (!p.dueAt) return false;
          const t = new Date(p.dueAt).getTime();
          return !Number.isNaN(t) && t - now >= 0 && t - now <= weekMs;
        });
      } else if (filters.dueWindow === "overdue") {
        result = result.filter((p) => {
          if (!p.dueAt) return false;
          const t = new Date(p.dueAt).getTime();
          return !Number.isNaN(t) && t < now;
        });
      } else if (filters.dueWindow === "no_due") {
        result = result.filter((p) => !p.dueAt);
      }
    }

    return result;
  }, [programs, filters]);

  const isNotFound =
    error instanceof WorkflowApiError && error.status === 404;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tg-text">اتاق انتشار</h1>
          <p className="text-sm text-tg-secondary">مدیریت برنامه‌ها، خروجی‌ها و انتشار در تلگرام، یوتیوب و اینستاگرام</p>
        </div>
        <Link href="/workflow/new">
          <Button className="min-h-[44px]">
            <Plus className="h-4 w-4" />
            ایجاد برنامه
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      )}

      {error && !isLoading && (
        <div className="space-y-3">
          <ErrorState
            message={
              isNotFound
                ? "اتاق انتشار هنوز فعال نشده است. پس از فعال‌سازی، داده‌ها اینجا نمایش داده می‌شوند."
                : (error.message ?? "خطا در دریافت برنامه‌ها")
            }
          />
          <Button variant="secondary" onClick={() => mutate()} className="min-h-[44px]">
            تلاش دوباره
          </Button>
        </div>
      )}

      {!isLoading && !error && programs.length === 0 && (
        <EmptyState
          title="هنوز برنامه‌ای ثبت نشده"
          description="اولین برنامه خود را از یک الگو یا به‌صورت خالی بسازید تا ماتریس اتاق انتشار فعال شود."
          action={
            <Link href="/workflow/new">
              <Button className="min-h-[44px]">ایجاد برنامه</Button>
            </Link>
          }
        />
      )}

      {!isLoading && !error && programs.length > 0 && (
        <>
          <WorkflowSummary programs={programs} />
          <WorkflowFilters value={filters} onChange={setFilters} />

          {filtered.length === 0 ? (
            <EmptyState
              title="نتیجه‌ای یافت نشد"
              description="فیلترها را تغییر دهید یا جست‌وجوی دیگری امتحان کنید."
              action={
                <Button
                  variant="secondary"
                  className="min-h-[44px]"
                  onClick={() =>
                    setFilters({ query: "", attentionOnly: false, stage: "", assignee: "", platform: "", dueWindow: "" })
                  }
                >
                  پاک کردن فیلترها
                </Button>
              }
            />
          ) : (
            <>
              <WorkflowMatrix programs={filtered} expandedIds={expandedIds} onToggle={toggleExpand} />
              <WorkflowCards programs={filtered} expandedIds={expandedIds} onToggle={toggleExpand} />
            </>
          )}
        </>
      )}
    </div>
  );
}
