import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { classroomRevisionRouteParamsSchema } from '@/lib/server/classroom/contracts';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { restoreClassroomRevision } from '@/lib/server/classroom-revision-store';
import { handleRouteError } from '@/lib/server/route-error';
import type { RestoreClassroomRevisionResponseData } from '@/lib/server/classroom/types';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; revisionId: string }> }) {
  try {
    const params = parseWithSchema(classroomRevisionRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const result = await restoreClassroomRevision({
      classroomId: params.data.id,
      revisionId: params.data.revisionId,
      baseUrl: buildRequestOrigin(req),
    });

    return apiSuccess<RestoreClassroomRevisionResponseData>(result);
  } catch (error) {
    return handleRouteError(error, 'Failed to restore classroom revision');
  }
}
