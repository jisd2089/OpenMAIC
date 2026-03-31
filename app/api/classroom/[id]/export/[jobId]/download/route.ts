import { promises as fs } from 'fs';
import { type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseWithSchema } from '@/lib/server/http-validation';
import { classroomExportRouteParamsSchema } from '@/lib/server/classroom/contracts';
import { readCourseExportJob } from '@/lib/server/classroom-export-store';
import { buildAttachmentContentDisposition } from '@/lib/server/content-disposition';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string; jobId: string }> }) {
  try {
    const params = parseWithSchema(classroomExportRouteParamsSchema, await context.params);
    if (!params.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, params.error);
    }

    const { id, jobId } = params.data;
    const job = await readCourseExportJob(jobId);
    if (!job || job.classroomId !== id) {
      return apiError(API_ERROR_CODES.EXPORT_JOB_NOT_FOUND, 404, 'Course export job not found');
    }
    if (job.status !== 'succeeded' || !job.filePath || !job.result) {
      return apiError(API_ERROR_CODES.EXPORT_FILE_NOT_READY, 409, 'Course export file is not ready');
    }

    const buffer = await fs.readFile(job.filePath);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': buildAttachmentContentDisposition(job.result.fileName),
      },
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to download course export file',
      error instanceof Error ? error.message : String(error),
    );
  }
}
