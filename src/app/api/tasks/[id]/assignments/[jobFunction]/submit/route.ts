import { firstZodIssueMessage, jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { JOB_FUNCTIONS } from "@/lib/job-functions";
import { taskActorFromUser } from "@/lib/task-board/access";
import { mapTaskRepositoryError } from "@/lib/task-board/http";
import { createTaskRepository, type TaskRepository } from "@/lib/task-board/repository";
import { PostgresTaskPort } from "@/lib/task-board/postgres-port";
import { submitAssignmentSchema } from "@/lib/task-board/validation";

export interface TaskSubmitRouteDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<TaskRepository, "submitAssignment">;
}

export type TaskSubmitRouteContext = { params: Promise<{ id: string; jobFunction: string }> };

let cachedRepository: TaskRepository | null = null;

function defaultRepository(): TaskRepository {
  if (!cachedRepository) cachedRepository = createTaskRepository(new PostgresTaskPort());
  return cachedRepository;
}

export async function handleTaskSubmitRequest(
  request: Request,
  ctx: TaskSubmitRouteContext,
  deps?: TaskSubmitRouteDependencies,
): Promise<Response> {
  const resolved: TaskSubmitRouteDependencies = deps ?? {
    getCurrentUser,
    repository: defaultRepository(),
  };
  const { id, jobFunction } = await ctx.params;
  if (!(JOB_FUNCTIONS as readonly string[]).includes(jobFunction)) {
    return jsonError("سمت نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const user = await resolved.getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const parsed = submitAssignmentSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstZodIssueMessage(parsed.error), 422, "VALIDATION_ERROR");
  try {
    const result = await resolved.repository.submitAssignment({
      actor: taskActorFromUser(user as never),
      taskId: id,
      jobFunction: jobFunction as (typeof JOB_FUNCTIONS)[number],
      expectedVersion: parsed.data.expectedVersion,
      submissionNote: parsed.data.submissionNote ?? null,
      submissionUrl: parsed.data.submissionUrl ?? null,
    });
    return jsonOk(result);
  } catch (error) {
    const mapped = mapTaskRepositoryError(error);
    if (mapped) return mapped;
    return jsonInternalError(error, "api/tasks submit POST");
  }
}

export async function POST(request: Request, ctx: TaskSubmitRouteContext): Promise<Response> {
  return handleTaskSubmitRequest(request, ctx);
}


