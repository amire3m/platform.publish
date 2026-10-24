import { firstZodIssueMessage, jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { taskActorFromUser } from "@/lib/task-board/access";
import { mapTaskRepositoryError } from "@/lib/task-board/http";
import { createTaskRepository, type TaskRepository } from "@/lib/task-board/repository";
import { PostgresTaskPort } from "@/lib/task-board/postgres-port";
import { versionActionSchema } from "@/lib/task-board/validation";

export interface TaskArchiveRouteDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<TaskRepository, "archiveTask">;
}

export type TaskArchiveRouteContext = { params: Promise<{ id: string }> };

let cachedRepository: TaskRepository | null = null;

function defaultRepository(): TaskRepository {
  if (!cachedRepository) cachedRepository = createTaskRepository(new PostgresTaskPort());
  return cachedRepository;
}

export async function handleTaskArchiveRequest(
  request: Request,
  ctx: TaskArchiveRouteContext,
  deps?: TaskArchiveRouteDependencies,
): Promise<Response> {
  const resolved: TaskArchiveRouteDependencies = deps ?? {
    getCurrentUser,
    repository: defaultRepository(),
  };
  const { id } = await ctx.params;
  const user = await resolved.getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const parsed = versionActionSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
  try {
    const result = await resolved.repository.archiveTask({
      actor: taskActorFromUser(user as never),
      taskId: id,
      expectedVersion: parsed.data.expectedVersion,
    });
    return jsonOk(result);
  } catch (error) {
    const mapped = mapTaskRepositoryError(error);
    if (mapped) return mapped;
    return jsonInternalError(error, "api/tasks/[id]/archive POST");
  }
}

export async function POST(request: Request, ctx: TaskArchiveRouteContext): Promise<Response> {
  return handleTaskArchiveRequest(request, ctx);
}


