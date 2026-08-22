export interface PersistedPlatformTarget {
  platform: string;
  account_id: string;
  content_type?: string;
  status?: string;
  publish_at_utc?: string | null;
  publish_at_jalali?: string | null;
  fields?: Record<string, unknown>;
  attempts?: number;
  next_retry_at?: string | null;
  external_id?: string | null;
  permalink?: string | null;
  last_error?: string | null;
  workflow_publication_id?: string | null;
  // allow additional unknown keys
  [key: string]: unknown;
}

export function parsePersistedTargets(raw: unknown): PersistedPlatformTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item !== null && typeof item === "object")
    .map((item) => {
      const r = item as Record<string, unknown>;
      // Normalize snake/camel for workflow key
      const workflowId =
        (r.workflow_publication_id as string | undefined) ??
        (r.workflowPublicationId as string | undefined) ??
        (r.workflow_publicationId as string | undefined) ??
        undefined;

      // Handle retry/result fields with both snake and camel fallbacks
      const nextRetry =
        (r.next_retry_at as string | null | undefined) ??
        (r.nextRetryAt as string | null | undefined) ??
        null;
      const externalId =
        (r.external_id as string | null | undefined) ??
        (r.externalId as string | null | undefined) ??
        null;
      const lastError =
        (r.last_error as string | null | undefined) ??
        (r.lastError as string | null | undefined) ??
        null;

      const target: PersistedPlatformTarget = {
        platform: (r.platform as string) ?? "",
        account_id: (r.account_id as string) ?? (r.accountId as string) ?? "",
        content_type: (r.content_type as string) ?? (r.contentType as string) ?? undefined,
        status: (r.status as string) ?? undefined,
        publish_at_utc: (r.publish_at_utc as string | null) ?? (r.publishAtUtc as string | null) ?? null,
        publish_at_jalali: (r.publish_at_jalali as string | null) ?? (r.publishAtJalali as string | null) ?? null,
        fields: (r.fields as Record<string, unknown>) ?? {},
        attempts: typeof r.attempts === "number" ? (r.attempts as number) : undefined,
        next_retry_at: nextRetry,
        external_id: externalId,
        permalink: (r.permalink as string | null) ?? null,
        last_error: lastError,
        workflow_publication_id: workflowId,
      };

      // Preserve any additional unknown keys (spread original but override normalized)
      // Keep original keys for backward compat but ensure normalized fields win
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (!(k in target) || target[k as keyof PersistedPlatformTarget] === undefined) {
          // only set if not already normalized, to avoid overwriting snake with camel
          if (k !== "workflowPublicationId" && k !== "nextRetryAt" && k !== "externalId" && k !== "lastError") {
            extra[k] = v;
          }
        }
      }
      // Merge but keep normalized workflow_publication_id etc.
      Object.assign(target, extra);
      // Re-ensure normalized values after merge
      if (workflowId !== undefined) target.workflow_publication_id = workflowId;
      if (nextRetry !== null) target.next_retry_at = nextRetry;
      if (externalId !== null) target.external_id = externalId;
      if (lastError !== null) target.last_error = lastError;

      return target;
    });
}

export function targetForWorkflowPublication(
  targets: PersistedPlatformTarget[],
  publicationId: string,
): PersistedPlatformTarget | undefined {
  return targets.find((t) => t.workflow_publication_id === publicationId);
}
