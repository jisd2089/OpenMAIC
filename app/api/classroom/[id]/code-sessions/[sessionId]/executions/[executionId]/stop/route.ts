import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { classroomCodeRouteParamsSchema } from '@/lib/server/code/contracts';
import { stopCodeExecution } from '@/lib/server/code/service';

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string; sessionId: string; executionId: string }> },
) {
  const params = parseWithSchema(classroomCodeRouteParamsSchema, await context.params);
  if (!params.success || !params.data.sessionId || !params.data.executionId) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.success ? 'Missing execution id' : params.error);
  }

  try {
    const execution = await stopCodeExecution({
      classroomId: params.data.id,
      sessionId: params.data.sessionId,
      executionId: params.data.executionId,
    });
    return apiSuccess({ execution });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      404,
      error instanceof Error ? error.message : 'Code execution not found',
    );
  }
}
