import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import { applyClassroomRegenerationSchema, classroomRegenerationRouteParamsSchema } from '@/lib/server/classroom/contracts';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { applyClassroomRegeneration } from '@/lib/server/course-regeneration';
import { handleRouteError } from '@/lib/server/route-error';
import type { ApplyClassroomRegenerationResponseData } from '@/lib/server/classroom/types';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; jobId: string }> }) {
  try {
    const params = parseWithSchema(classroomRegenerationRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }
    const parsed = await parseJsonRequestWithSchema(req, applyClassroomRegenerationSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const result = await applyClassroomRegeneration({
      classroomId: params.data.id,
      jobId: params.data.jobId,
      createRevision: parsed.data.createRevision,
      baseUrl: buildRequestOrigin(req),
    });

    return apiSuccess<ApplyClassroomRegenerationResponseData>(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to apply classroom regeneration preview');
  }
}
