import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { classroomExportRouteParamsSchema } from '@/lib/server/classroom/contracts';
import {
  isValidCourseExportJobId,
  readCourseExportJob,
} from '@/lib/server/classroom-export-store';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string; jobId: string }> }) {
  try {
    const params = parseWithSchema(classroomExportRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const { id, jobId } = params.data;
    if (!isValidCourseExportJobId(jobId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid course export job id');
    }

    const job = await readCourseExportJob(jobId);
    if (!job || job.classroomId !== id) {
      return apiError(API_ERROR_CODES.EXPORT_JOB_NOT_FOUND, 404, 'Course export job not found');
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
      'Failed to retrieve course export job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
