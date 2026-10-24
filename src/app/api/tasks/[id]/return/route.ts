import { firstZodIssueMessage, jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { taskActorFromUser } from "@/lib/task-board/access";
import { mapTaskRepositoryError } from "@/lib/task-board/http";
import { createTaskRepository, type TaskRepository } from "@/lib/task-board/repository";
import { PostgresTaskPort } from "@/lib/task-board/postgres-port";
import { returnTaskSchema } from "@/lib/task-board/validation";

export interface TaskReturnRouteDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<TaskRepository, "returnAssignments">;
}

export type TaskReturnRouteContext = { params: Promise<{ id: string }> };

let cachedRepository: TaskRepository | null = null;

function defaultRepository(): TaskRepository {
  if (!cachedRepository) cachedRepository = createTaskRepository(new PostgresTaskPort());
  return cachedRepository;
}

export async function handleTaskReturnRequest(
  request: Request,
  ctx: TaskReturnRouteContext,
  deps?: TaskReturnRouteDependencies,
): Promise<Response> {
  const resolved: TaskReturnRouteDependencies = deps ?? {
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
  const parsed = returnTaskSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
  try {
    const result = await resolved.repository.returnAssignments({
      actor: taskActorFromUser(user as never),
      taskId: id,
      expectedVersion: parsed.data.expectedVersion,
      jobFunctions: parsed.data.jobFunctions,
      reason: parsed.data.reason,
    });
    return jsonOk(result);
  } catch (error) {
    const mapped = mapTaskRepositoryError(error);
    if (mapped) return mapped;
    return jsonInternalError(error, "api/tasks/[id]/return POST");
  }
}

export async function POST(request: Request, ctx: TaskReturnRouteContext): Promise<Response> {
  return handleTaskReturnRequest(request, ctx);
}


