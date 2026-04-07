import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { classroomCodeRouteParamsSchema } from '@/lib/server/code/contracts';
import { readCodeExecution } from '@/lib/server/code/storage';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; sessionId: string; executionId: string }> },
) {
  const params = parseWithSchema(classroomCodeRouteParamsSchema, await context.params);
  if (!params.success || !params.data.sessionId || !params.data.executionId) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.success ? 'Missing execution id' : params.error);
  }

  const execution = await readCodeExecution(
    params.data.id,
    params.data.sessionId,
    params.data.executionId,
  );
  if (!execution) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Code execution not found');
  }

  return apiSuccess({ execution });
}
