import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { classroomRegenerationRouteParamsSchema, discardClassroomRegenerationSchema } from '@/lib/server/classroom/contracts';
import { discardClassroomRegeneration } from '@/lib/server/course-regeneration';
import { handleRouteError } from '@/lib/server/route-error';
import type { DiscardClassroomRegenerationResponseData } from '@/lib/server/classroom/types';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; jobId: string }> }) {
  try {
    const params = parseWithSchema(classroomRegenerationRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }
    const parsed = await parseJsonRequestWithSchema(req, discardClassroomRegenerationSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }
    void parsed;

    const result = await discardClassroomRegeneration({
      classroomId: params.data.id,
      jobId: params.data.jobId,
    });

    return apiSuccess<DiscardClassroomRegenerationResponseData>(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to discard classroom regeneration preview');
  }
}
