import { promises as fs } from 'fs';
import path from 'path';
import { ServiceError } from '@/lib/server/service-error';
import { API_ERROR_CODES } from '@/lib/server/api-response';
import { readClassroom } from '@/lib/server/classroom-storage';
import { buildCoursePackageBuffer } from '@/lib/server/course-package';
import type { CreateCourseExportJobInput } from '@/lib/server/classroom/contracts';
import type { CourseExportJobResult } from '@/lib/server/classroom/types';
import { listAllClassroomRevisions } from '@/lib/server/classroom-revision-store';

export async function generateCourseExportPackage(params: {
  classroomId: string;
  jobId: string;
  options: CreateCourseExportJobInput;
  jobDir: string;
  baseUrl: string;
}): Promise<{ result: CourseExportJobResult; warning?: string }> {
  const classroom = await readClassroom(params.classroomId);
  if (!classroom) {
    throw new ServiceError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
  }

  const revisions = params.options.includeRevisions
    ? await listAllClassroomRevisions(params.classroomId)
    : [];

  const { buffer, fileName, manifest } = await buildCoursePackageBuffer({
    classroomId: classroom.id,
    stage: classroom.stage,
    scenes: classroom.scenes,
    includeContext: params.options.includeContext,
    includeAssets: params.options.includeAssets,
    revisions,
  });

  const outputPath = path.join(params.jobDir, fileName);
  await fs.writeFile(outputPath, buffer);

  return {
    result: {
      fileName,
      downloadUrl: `${params.baseUrl}/api/classroom/${params.classroomId}/export/${params.jobId}/download`,
      manifest,
    },
  };
}
