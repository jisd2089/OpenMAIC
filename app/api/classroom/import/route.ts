import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { courseImportFormFieldsSchema } from '@/lib/server/classroom/contracts';
import { createCourseImportJob } from '@/lib/server/classroom-import-store';
import { runCourseImportValidationJob } from '@/lib/server/classroom-import-runner';
import type { CreateCourseImportJobResponseData } from '@/lib/server/classroom/types';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const strategy = formData.get('strategy')?.toString();
    const parsed = parseWithSchema(courseImportFormFieldsSchema, { strategy });
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }
    if (!(file instanceof File)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required form field: file');
    }
    if (!/\.(zip|omaic-course\.zip)$/i.test(file.name)) {
      return apiError(
        API_ERROR_CODES.IMPORT_PACKAGE_INVALID,
        400,
        'Course package file must be a .zip or .omaic-course.zip file',
      );
    }

    const jobId = nanoid(10);
    const buffer = Buffer.from(await file.arrayBuffer());
    const job = await createCourseImportJob({
      jobId,
      uploadedFileName: file.name,
      uploadedFileBuffer: buffer,
      strategy: parsed.data.strategy,
    });

    after(() => runCourseImportValidationJob(jobId));

    const response: CreateCourseImportJobResponseData = {
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
      'Failed to create course import job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
