import { firstZodIssueMessage, jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { taskActorFromUser } from "@/lib/task-board/access";
import { mapTaskRepositoryError } from "@/lib/task-board/http";
import { createTaskRepository, type TaskRepository } from "@/lib/task-board/repository";
import { PostgresTaskPort } from "@/lib/task-board/postgres-port";
import { taskHistoryQuerySchema } from "@/lib/task-board/validation";

export interface TaskHistoryRouteDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<TaskRepository, "listHistory">;
}

export type TaskHistoryRouteContext = { params: Promise<{ id: string }> };

let cachedRepository: TaskRepository | null = null;

function defaultRepository(): TaskRepository {
  if (!cachedRepository) cachedRepository = createTaskRepository(new PostgresTaskPort());
  return cachedRepository;
}

export async function handleTaskHistoryRequest(
  request: Request,
  ctx: TaskHistoryRouteContext,
  deps?: TaskHistoryRouteDependencies,
): Promise<Response> {
  const resolved: TaskHistoryRouteDependencies = deps ?? {
    getCurrentUser,
    repository: defaultRepository(),
  };
  const { id } = await ctx.params;
  const user = await resolved.getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const url = new URL(request.url);
  const parsed = taskHistoryQuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return jsonError(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
  try {
    const result = await resolved.repository.listHistory({
      actor: taskActorFromUser(user as never),
      taskId: id,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });
    return jsonOk(result);
  } catch (error) {
    const mapped = mapTaskRepositoryError(error);
    if (mapped) return mapped;
    return jsonInternalError(error, "api/tasks/[id]/history GET");
  }
}

export async function GET(request: Request, ctx: TaskHistoryRouteContext): Promise<Response> {
  return handleTaskHistoryRequest(request, ctx);
}


