"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TaskBoard from "@/components/tasks/TaskBoard";

function TasksPageInner() {
  const params = useSearchParams();
  return <TaskBoard initialTaskId={params.get("task")} />;
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksPageInner />
    </Suspense>
  );
}
