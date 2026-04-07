import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { classroomCodeRouteParamsSchema, saveCodeDraftSchema } from '@/lib/server/code/contracts';
import { releaseCodeSession, saveCodeSessionDraft } from '@/lib/server/code/service';

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string; sessionId: string }> },
) {
  const params = parseWithSchema(classroomCodeRouteParamsSchema, await context.params);
  if (!params.success || !params.data.sessionId) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.success ? 'Missing session id' : params.error);
  }

  const parsed = await parseJsonRequestWithSchema(req, saveCodeDraftSchema);
  if (!parsed.success) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
  }

  try {
    const session = await saveCodeSessionDraft({
      classroomId: params.data.id,
      sessionId: params.data.sessionId,
      language: parsed.data.language,
      entrypoint: parsed.data.entrypoint,
      stdin: parsed.data.stdin,
      files: parsed.data.files,
    });
    return apiSuccess({ session });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.CLASSROOM_NOT_FOUND,
      404,
      error instanceof Error ? error.message : 'Code session not found',
    );
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; sessionId: string }> },
) {
  const params = parseWithSchema(classroomCodeRouteParamsSchema, await context.params);
  if (!params.success || !params.data.sessionId) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.success ? 'Missing session id' : params.error);
  }

  try {
    const session = await releaseCodeSession({
      classroomId: params.data.id,
      sessionId: params.data.sessionId,
    });
    return apiSuccess({ session });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.CLASSROOM_NOT_FOUND,
      404,
      error instanceof Error ? error.message : 'Code session not found',
    );
  }
}
