import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { classroomImportRouteParamsSchema } from '@/lib/server/classroom/contracts';
import { isValidCourseImportJobId, readCourseImportJob } from '@/lib/server/classroom-import-store';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const params = parseWithSchema(classroomImportRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const { jobId } = params.data;
    if (!isValidCourseImportJobId(jobId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid course import job id');
    }

    const job = await readCourseImportJob(jobId);
    if (!job) {
      return apiError(API_ERROR_CODES.IMPORT_JOB_NOT_FOUND, 404, 'Course import job not found');
    }

    return apiSuccess({
      job,
      done: job.status === 'succeeded' || job.status === 'failed',
      pollIntervalMs: 3000,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve course import job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
