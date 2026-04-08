import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { classroomRouteParamsSchema } from '@/lib/server/classroom/contracts';
import { codeSessionScopeSchema } from '@/lib/server/code/contracts';
import { createOrRestoreCodeSession } from '@/lib/server/code/service';
import { readClassroom } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomCodeSessionsRoute');

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
  if (!params.success) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
  }

  const classroom = await readClassroom(params.data.id);
  if (!classroom) {
    return apiError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
  }

  const parsed = await parseJsonRequestWithSchema(req, codeSessionScopeSchema);
  if (!parsed.success) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
  }

  try {
    const result = await createOrRestoreCodeSession({
      classroomId: params.data.id,
      sceneId: parsed.data.sceneId,
      clientSessionId: parsed.data.clientSessionId,
      view: parsed.data.view,
      language: parsed.data.language,
    });

    return apiSuccess({
      session: result.session,
      runtimes: (await import('@/lib/server/code/runtime-registry')).listSupportedCodeRuntimes(),
      lastExecution: result.lastExecution,
    });
  } catch (error) {
    log.error('Failed to create or restore code session', {
      classroomId: params.data.id,
      sceneId: parsed.data.sceneId,
      error,
    });
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : 'Failed to create code session',
    );
  }
}
