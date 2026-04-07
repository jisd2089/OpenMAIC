import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { classroomCodeRouteParamsSchema, runCodeExecutionSchema } from '@/lib/server/code/contracts';
import { runCodeSession } from '@/lib/server/code/service';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; sessionId: string }> },
) {
  const params = parseWithSchema(classroomCodeRouteParamsSchema, await context.params);
  if (!params.success || !params.data.sessionId) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.success ? 'Missing session id' : params.error);
  }

  const parsed = await parseJsonRequestWithSchema(req, runCodeExecutionSchema);
  if (!parsed.success) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
  }

  try {
    const result = await runCodeSession({
      classroomId: params.data.id,
      sessionId: params.data.sessionId,
      language: parsed.data.language,
      entrypoint: parsed.data.entrypoint,
      stdin: parsed.data.stdin,
      files: parsed.data.files,
      origin: buildRequestOrigin(req),
    });

    return apiSuccess({
      session: result.session,
      execution: result.execution,
      pollUrl: `/api/classroom/${params.data.id}/code-sessions/${params.data.sessionId}/executions/${result.execution.id}`,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : 'Failed to run code',
    );
  }
}
