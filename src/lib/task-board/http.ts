import { jsonError } from "@/lib/api-helpers";

export function mapTaskRepositoryError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "error";
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  if (code === "FORBIDDEN") return jsonError(message, 403, "FORBIDDEN");
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "INVALID_TRANSITION") return jsonError(message, 409, "INVALID_TRANSITION");
  if (code === "INVALID_LINK") return jsonError(message, 422, "INVALID_LINK");
  return null;
}

