import { promises as fs } from 'fs';
import path from 'path';
import {
  CLASSROOM_REGENERATION_JOBS_DIR,
  ensureClassroomRegenerationJobsDir,
  writeJsonFileAtomic,
} from '@/lib/server/classroom-storage';
import type {
  ClassroomRegenerationJobSummary,
  ClassroomRegenerationPreview,
} from '@/lib/server/classroom/types';

export interface ClassroomRegenerationJob extends ClassroomRegenerationJobSummary {
  scopeId?: string;
  knowledgeBaseIds: string[];
  memoryIds: string[];
  targetSceneIds: string[];
}

function jobDir(jobId: string) {
  return path.join(CLASSROOM_REGENERATION_JOBS_DIR, jobId);
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
    if (jobLocks.get(jobId) === next) {
      jobLocks.delete(jobId);
    }
  }
}

export async function createClassroomRegenerationJob(params: {
  jobId: string;
  classroomId: string;
  targetType: ClassroomRegenerationJob['targetType'];
  targetId?: string;
  targetSceneIds: string[];
  regenerateMode: ClassroomRegenerationJob['regenerateMode'];
  preserveManualEdits: boolean;
  prompt: string;
  scopeId?: string;
  knowledgeBaseIds: string[];
  memoryIds: string[];
}): Promise<ClassroomRegenerationJob> {
  const now = new Date().toISOString();
  const job: ClassroomRegenerationJob = {
    id: params.jobId,
    classroomId: params.classroomId,
    status: 'pending',
    step: 'queued',
    message: 'Classroom regeneration job queued',
    targetType: params.targetType,
    targetId: params.targetId,
    regenerateMode: params.regenerateMode,
    preserveManualEdits: params.preserveManualEdits,
    prompt: params.prompt,
    createdAt: now,
    updatedAt: now,
    scopeId: params.scopeId,
    knowledgeBaseIds: params.knowledgeBaseIds,
    memoryIds: params.memoryIds,
    targetSceneIds: params.targetSceneIds,
  };

  await ensureClassroomRegenerationJobsDir();
  await fs.mkdir(jobDir(params.jobId), { recursive: true });
  await writeJsonFileAtomic(jobFilePath(params.jobId), job);
  return job;
}

export async function readClassroomRegenerationJob(
  jobId: string,
): Promise<ClassroomRegenerationJob | null> {
  try {
    const content = await fs.readFile(jobFilePath(jobId), 'utf-8');
    return JSON.parse(content) as ClassroomRegenerationJob;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function updateClassroomRegenerationJob(
  jobId: string,
  patch: Partial<ClassroomRegenerationJob> & { preview?: ClassroomRegenerationPreview },
): Promise<ClassroomRegenerationJob> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomRegenerationJob(jobId);
    if (!existing) {
      throw new Error(`Classroom regeneration job not found: ${jobId}`);
    }

    const updated: ClassroomRegenerationJob = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFileAtomic(jobFilePath(jobId), updated);
    return updated;
  });
}
