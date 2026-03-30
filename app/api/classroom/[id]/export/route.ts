import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema, parseWithSchema } from '@/lib/server/http-validation';
import {
  classroomRouteParamsSchema,
  createCourseExportJobSchema,
} from '@/lib/server/classroom/contracts';
import { buildRequestOrigin, isValidClassroomId, readClassroom } from '@/lib/server/classroom-storage';
import { createCourseExportJob } from '@/lib/server/classroom-export-store';
import { runCourseExportJob } from '@/lib/server/classroom-export-runner';
import type { CreateCourseExportJobResponseData } from '@/lib/server/classroom/types';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = parseWithSchema(classroomRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const parsed = await parseJsonRequestWithSchema(req, createCourseExportJobSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const classroomId = params.data.id;
    if (!isValidClassroomId(classroomId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(classroomId);
    if (!classroom) {
      return apiError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
    }

    const baseUrl = buildRequestOrigin(req);
    const jobId = nanoid(10);
    const job = await createCourseExportJob({
      jobId,
      classroomId,
      includeAssets: parsed.data.includeAssets,
      includeContext: parsed.data.includeContext,
      includeRevisions: parsed.data.includeRevisions,
    });

    after(() => runCourseExportJob(jobId, classroomId, parsed.data, baseUrl));

    const response: CreateCourseExportJobResponseData = {
      jobId,
      status: job.status,
      step: job.step,
      message: job.message,
    };

    return apiSuccess(response, 202);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create course export job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
