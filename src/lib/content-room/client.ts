export class ContentRoomApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ContentRoomApiError";
  }
}

export async function fetchContentRoomApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok || !body.ok) throw new ContentRoomApiError(body.error ?? "خطای ارتباط با سرور", response.status, body.code);
  return body.data as T;
}

// Re-export workflow-compatible fetcher for list page requirement
export const fetchWorkflowApi = fetchContentRoomApi;
export const WorkflowApiError = ContentRoomApiError;
