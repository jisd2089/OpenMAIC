import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import {
  applyCourseImportSchema,
  classroomImportRouteParamsSchema,
} from '@/lib/server/classroom/contracts';
import { applyCourseImportResult } from '@/lib/server/course-import';
import { readCourseImportJob, updateCourseImportJob } from '@/lib/server/classroom-import-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { handleRouteError } from '@/lib/server/route-error';
import type { ApplyCourseImportResponseData } from '@/lib/server/classroom/types';

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const params = parseWithSchema(classroomImportRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const parsed = await parseJsonRequestWithSchema(req, applyCourseImportSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const job = await readCourseImportJob(params.data.jobId);
    if (!job) {
      return apiError(API_ERROR_CODES.IMPORT_JOB_NOT_FOUND, 404, 'Course import job not found');
    }
    if (job.status !== 'validated' && job.status !== 'succeeded') {
      return apiError(API_ERROR_CODES.IMPORT_PACKAGE_INVALID, 409, 'Course import job is not ready to apply');
    }

    const result = await applyCourseImportResult({
      job,
      input: parsed.data,
      baseUrl: buildRequestOrigin(req),
    });

    await updateCourseImportJob(job.id, {
      status: 'succeeded',
      step: 'applied',
      message: 'Course import applied',
      result,
    });

    const response: ApplyCourseImportResponseData = result;
    return apiSuccess(response);
  } catch (error) {
    return handleRouteError(error, 'Failed to apply course import');
  }
}
