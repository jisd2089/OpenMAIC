import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { classroomRegenerationRouteParamsSchema } from '@/lib/server/classroom/contracts';
import { readClassroomRegenerationJob } from '@/lib/server/classroom-regeneration-store';
import { handleRouteError } from '@/lib/server/route-error';
import type { GetClassroomRegenerationJobResponseData } from '@/lib/server/classroom/types';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string; jobId: string }> }) {
  try {
    const params = parseWithSchema(classroomRegenerationRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const job = await readClassroomRegenerationJob(params.data.jobId);
    if (!job || job.classroomId !== params.data.id) {
      return apiError(API_ERROR_CODES.REGENERATION_JOB_NOT_FOUND, 404, 'Regeneration job not found');
    }

    return apiSuccess<GetClassroomRegenerationJobResponseData>({ job });
  } catch (error) {
    return handleRouteError(error, 'Failed to retrieve classroom regeneration job');
  }
}
