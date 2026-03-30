import { createLogger } from '@/lib/logger';
import { readClassroomRegenerationJob, updateClassroomRegenerationJob } from '@/lib/server/classroom-regeneration-store';
import { runClassroomRegeneration } from '@/lib/server/course-regeneration';

const log = createLogger('ClassroomRegenerationJob');
const runningJobs = new Map<string, Promise<void>>();

export function runClassroomRegenerationJob(jobId: string): Promise<void> {
  const existing = runningJobs.get(jobId);
  if (existing) {
    return existing;
  }

  const jobPromise = (async () => {
    try {
      await runClassroomRegeneration(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Classroom regeneration job ${jobId} failed:`, error);
      const existingJob = await readClassroomRegenerationJob(jobId);
      if (existingJob) {
        await updateClassroomRegenerationJob(jobId, {
          status: 'failed',
          step: 'failed',
          message: 'Classroom regeneration failed',
          error: message,
        });
      }
    } finally {
      runningJobs.delete(jobId);
    }
  })();

  runningJobs.set(jobId, jobPromise);
  return jobPromise;
}
