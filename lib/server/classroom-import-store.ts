import { promises as fs } from 'fs';
import path from 'path';
import {
  COURSE_IMPORTS_DIR,
  ensureCourseImportsDir,
  writeJsonFileAtomic,
} from '@/lib/server/classroom-storage';
import type { CourseImportJobSummary, ClassroomRevisionRecord } from '@/lib/server/classroom/types';
import type { Stage, Scene } from '@/lib/types/stage';

export interface ClassroomImportJob extends CourseImportJobSummary {
  strategy: 'create-new' | 'duplicate';
  uploadedFilePath: string;
  extracted?: {
    stage: Stage;
    scenes: Scene[];
    context: unknown | null;
    revisions: ClassroomRevisionRecord[];
  };
}

function jobDir(jobId: string) {
  return path.join(COURSE_IMPORTS_DIR, jobId);
}

function jobFilePath(jobId: string) {
  return path.join(jobDir(jobId), 'job.json');
}

export function importUploadPath(jobId: string, fileName: string) {
  return path.join(jobDir(jobId), fileName);
}

const jobLocks = new Map<string, Promise<void>>();

async function withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
  const prev = jobLocks.get(jobId) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  jobLocks.set(jobId, next);
  try {
    await prev;
    return await fn();
  } finally {
    resolve!();
    if (jobLocks.get(jobId) === next) jobLocks.delete(jobId);
  }
}

export function isValidCourseImportJobId(jobId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(jobId);
}

export async function createCourseImportJob(params: {
  jobId: string;
  uploadedFileName: string;
  uploadedFileBuffer: Buffer;
  strategy: 'create-new' | 'duplicate';
}): Promise<ClassroomImportJob> {
  const now = new Date().toISOString();
  const dir = jobDir(params.jobId);
  const uploadedFilePath = importUploadPath(params.jobId, params.uploadedFileName);
  const job: ClassroomImportJob = {
    id: params.jobId,
    status: 'pending',
    step: 'uploaded',
    message: 'Course import job created',
    createdAt: now,
    updatedAt: now,
    uploadedFileName: params.uploadedFileName,
    uploadedFilePath,
    strategy: params.strategy,
  };

  await ensureCourseImportsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(uploadedFilePath, params.uploadedFileBuffer);
  await writeJsonFileAtomic(jobFilePath(params.jobId), job);
  return job;
}

export async function readCourseImportJob(jobId: string): Promise<ClassroomImportJob | null> {
  try {
    const content = await fs.readFile(jobFilePath(jobId), 'utf-8');
    return JSON.parse(content) as ClassroomImportJob;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function updateCourseImportJob(
  jobId: string,
  patch: Partial<ClassroomImportJob>,
): Promise<ClassroomImportJob> {
  return withJobLock(jobId, async () => {
    const existing = await readCourseImportJob(jobId);
    if (!existing) {
      throw new Error(`Course import job not found: ${jobId}`);
    }

    const updated: ClassroomImportJob = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFileAtomic(jobFilePath(jobId), updated);
    return updated;
  });
}
