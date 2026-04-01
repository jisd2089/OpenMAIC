import { promises as fs } from 'fs';
import path from 'path';
import { API_ERROR_CODES } from '@/lib/server/api-response';
import { ServiceError } from '@/lib/server/service-error';
import {
  CLASSROOM_REGENERATION_JOBS_DIR,
  COURSE_EXPORTS_DIR,
  classroomDir,
  classroomJsonPath,
  classroomRevisionsDir,
  readClassroom,
} from '@/lib/server/classroom-storage';
import { readCourseExportJob } from '@/lib/server/classroom-export-store';
import { readClassroomRegenerationJob } from '@/lib/server/classroom-regeneration-store';

async function removePathIfExists(targetPath: string) {
  await fs.rm(targetPath, { recursive: true, force: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  });
}

async function listChildDirs(rootDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function deleteRelatedExportJobs(classroomId: string) {
  const jobIds = await listChildDirs(COURSE_EXPORTS_DIR);
  await Promise.all(
    jobIds.map(async (jobId) => {
      const job = await readCourseExportJob(jobId);
      if (job?.classroomId === classroomId) {
        await removePathIfExists(path.join(COURSE_EXPORTS_DIR, jobId));
      }
    }),
  );
}

async function deleteRelatedRegenerationJobs(classroomId: string) {
  const jobIds = await listChildDirs(CLASSROOM_REGENERATION_JOBS_DIR);
  await Promise.all(
    jobIds.map(async (jobId) => {
      const job = await readClassroomRegenerationJob(jobId);
      if (job?.classroomId === classroomId) {
        await removePathIfExists(path.join(CLASSROOM_REGENERATION_JOBS_DIR, jobId));
      }
    }),
  );
}

export interface DeleteClassroomResult {
  classroomId: string;
  status: 'deleted';
  deletedAt: string;
}

export async function deleteClassroom(params: {
  classroomId: string;
}): Promise<DeleteClassroomResult> {
  const classroom = await readClassroom(params.classroomId);
  if (!classroom) {
    throw new ServiceError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
  }

  await Promise.all([
    deleteRelatedExportJobs(params.classroomId),
    deleteRelatedRegenerationJobs(params.classroomId),
    removePathIfExists(classroomDir(params.classroomId)),
    removePathIfExists(classroomRevisionsDir(params.classroomId)),
  ]);

  await removePathIfExists(classroomJsonPath(params.classroomId));

  return {
    classroomId: params.classroomId,
    status: 'deleted',
    deletedAt: new Date().toISOString(),
  };
}
