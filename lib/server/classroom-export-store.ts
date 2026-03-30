import { promises as fs } from 'fs';
import path from 'path';
import {
  COURSE_EXPORTS_DIR,
  ensureCourseExportsDir,
  writeJsonFileAtomic,
} from '@/lib/server/classroom-storage';
import type { CourseExportJobSummary } from '@/lib/server/classroom/types';

export interface ClassroomExportJob extends CourseExportJobSummary {
  includeAssets: boolean;
  includeContext: boolean;
  includeRevisions: boolean;
  warning?: string;
  filePath?: string;
}

function jobDir(jobId: string) {
  return path.join(COURSE_EXPORTS_DIR, jobId);
}

export function courseExportJobDir(jobId: string) {
  return jobDir(jobId);
}

function jobFilePath(jobId: string) {
  return path.join(jobDir(jobId), 'job.json');
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

export function isValidCourseExportJobId(jobId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(jobId);
}

export async function createCourseExportJob(params: {
  jobId: string;
  classroomId: string;
  includeAssets: boolean;
  includeContext: boolean;
  includeRevisions: boolean;
}): Promise<ClassroomExportJob> {
  const now = new Date().toISOString();
  const job: ClassroomExportJob = {
    id: params.jobId,
    classroomId: params.classroomId,
    status: 'pending',
    step: 'queued',
    message: 'Course export job queued',
    createdAt: now,
    updatedAt: now,
    includeAssets: params.includeAssets,
    includeContext: params.includeContext,
    includeRevisions: params.includeRevisions,
  };

  await ensureCourseExportsDir();
  await fs.mkdir(jobDir(params.jobId), { recursive: true });
  await writeJsonFileAtomic(jobFilePath(params.jobId), job);
  return job;
}

export async function readCourseExportJob(jobId: string): Promise<ClassroomExportJob | null> {
  try {
    const content = await fs.readFile(jobFilePath(jobId), 'utf-8');
    return JSON.parse(content) as ClassroomExportJob;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function updateCourseExportJob(
  jobId: string,
  patch: Partial<ClassroomExportJob>,
): Promise<ClassroomExportJob> {
  return withJobLock(jobId, async () => {
    const existing = await readCourseExportJob(jobId);
    if (!existing) {
      throw new Error(`Course export job not found: ${jobId}`);
    }

    const updated: ClassroomExportJob = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFileAtomic(jobFilePath(jobId), updated);
    return updated;
  });
}
