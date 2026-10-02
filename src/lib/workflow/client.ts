export class WorkflowApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "WorkflowApiError";
  }
}

import { timedFetch } from "@/lib/fetch-timeout";

export async function fetchWorkflowApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await timedFetch(url, init);
  const body = await response.json();
  if (!response.ok || !body.ok) throw new WorkflowApiError(body.error ?? "خطای ارتباط با سرور", response.status, body.code);
  return body.data as T;
}
