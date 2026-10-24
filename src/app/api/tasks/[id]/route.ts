import { firstZodIssueMessage, jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { taskActorFromUser } from "@/lib/task-board/access";
import { mapTaskRepositoryError } from "@/lib/task-board/http";
import { createTaskRepository, type TaskRepository } from "@/lib/task-board/repository";
import { PostgresTaskPort } from "@/lib/task-board/postgres-port";
import { updateTaskSchema } from "@/lib/task-board/validation";

export interface TaskDetailRouteDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<TaskRepository, "getTask" | "updateTask">;
}

export type TaskDetailRouteContext = { params: Promise<{ id: string }> };

let cachedRepository: TaskRepository | null = null;

function defaultRepository(): TaskRepository {
  if (!cachedRepository) cachedRepository = createTaskRepository(new PostgresTaskPort());
  return cachedRepository;
}

export async function handleTaskDetailRequest(
  request: Request,
  ctx: TaskDetailRouteContext,
  deps?: TaskDetailRouteDependencies,
): Promise<Response> {
  const resolved: TaskDetailRouteDependencies = deps ?? {
    getCurrentUser,
    repository: defaultRepository(),
  };
  const { id } = await ctx.params;
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const user = await resolved.getCurrentUser();
    if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
    try {
      const detail = await resolved.repository.getTask({ actor: taskActorFromUser(user as never), taskId: id });
      if (!detail) return jsonError("کار پیدا نشد.", 404, "NOT_FOUND");
      return jsonOk(detail);
    } catch (error) {
      const mapped = mapTaskRepositoryError(error);
      if (mapped) return mapped;
      return jsonInternalError(error, "api/tasks/[id] GET");
    }
  }

  if (method === "PATCH") {
    const user = await resolved.getCurrentUser();
    if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
    }
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) return jsonError(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
    try {
      const data = parsed.data;
      const updated = await resolved.repository.updateTask({
        actor: taskActorFromUser(user as never),
        taskId: id,
        expectedVersion: data.expectedVersion,
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt ? new Date(data.dueAt) : null } : {}),
        ...(data.productId !== undefined ? { productId: data.productId } : {}),
        ...(data.partId !== undefined ? { partId: data.partId } : {}),
        ...(data.jobFunctions !== undefined ? { jobFunctions: data.jobFunctions } : {}),
      });
      return jsonOk(updated);
    } catch (error) {
      const mapped = mapTaskRepositoryError(error);
      if (mapped) return mapped;
      return jsonInternalError(error, "api/tasks/[id] PATCH");
    }
  }

  return jsonError("روش پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");
}

export async function GET(request: Request, ctx: TaskDetailRouteContext): Promise<Response> {
  return handleTaskDetailRequest(request, ctx);
}

export async function PATCH(request: Request, ctx: TaskDetailRouteContext): Promise<Response> {
  return handleTaskDetailRequest(request, ctx);
}


