import { firstZodIssueMessage, jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { taskActorFromUser } from "@/lib/task-board/access";
import { mapTaskRepositoryError } from "@/lib/task-board/http";
import { createTaskRepository, type TaskRepository } from "@/lib/task-board/repository";
import { PostgresTaskPort } from "@/lib/task-board/postgres-port";
import { createTaskSchema, taskListQuerySchema } from "@/lib/task-board/validation";

export interface TasksRouteDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<TaskRepository, "listTasks" | "createTask">;
}

let cachedRepository: TaskRepository | null = null;

function defaultRepository(): TaskRepository {
  if (!cachedRepository) cachedRepository = createTaskRepository(new PostgresTaskPort());
  return cachedRepository;
}

function depsWithDefaults(deps?: TasksRouteDependencies): TasksRouteDependencies {
  if (deps) return deps;
  return { getCurrentUser, repository: defaultRepository() };
}

export async function handleTasksRequest(request: Request, deps?: TasksRouteDependencies): Promise<Response> {
  const resolved = depsWithDefaults(deps);
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const user = await resolved.getCurrentUser();
    if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
    const url = new URL(request.url);
    const raw = {
      column: url.searchParams.get("column") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      jobFunction: url.searchParams.get("jobFunction") ?? undefined,
      due: url.searchParams.get("due") ?? undefined,
      productId: url.searchParams.get("productId") ?? undefined,
      completedFrom: url.searchParams.get("completedFrom") ?? undefined,
      completedTo: url.searchParams.get("completedTo") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    };
    const parsed = taskListQuerySchema.safeParse(raw);
    if (!parsed.success) return jsonError(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
    try {
      const data = parsed.data;
      const result = await resolved.repository.listTasks({
        actor: taskActorFromUser(user as never),
        column: data.column,
        search: data.search,
        jobFunction: data.jobFunction,
        due: data.due,
        productId: data.productId,
        completedFrom: data.completedFrom ? new Date(data.completedFrom) : undefined,
        completedTo: data.completedTo ? new Date(data.completedTo) : undefined,
        cursor: data.cursor,
        limit: data.limit,
      });
      return jsonOk(result);
    } catch (error) {
      const mapped = mapTaskRepositoryError(error);
      if (mapped) return mapped;
      return jsonInternalError(error, "api/tasks GET");
    }
  }

  if (method === "POST") {
    const user = await resolved.getCurrentUser();
    if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
    }
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) return jsonError(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
    try {
      const data = parsed.data;
      const created = await resolved.repository.createTask({
        actor: taskActorFromUser(user as never),
        title: data.title,
        description: data.description ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        productId: data.productId ?? null,
        partId: data.partId ?? null,
        jobFunctions: data.jobFunctions,
      });
      return jsonOk(created, 201);
    } catch (error) {
      const mapped = mapTaskRepositoryError(error);
      if (mapped) return mapped;
      return jsonInternalError(error, "api/tasks POST");
    }
  }

  return jsonError("روش پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");
}

export async function GET(request: Request): Promise<Response> {
  return handleTasksRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleTasksRequest(request);
}



