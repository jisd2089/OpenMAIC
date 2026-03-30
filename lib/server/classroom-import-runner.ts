import { createLogger } from '@/lib/logger';
import { validateCourseImportPackage } from '@/lib/server/course-import';
import {
  readCourseImportJob,
  updateCourseImportJob,
} from '@/lib/server/classroom-import-store';

const log = createLogger('CourseImportJob');
const runningJobs = new Map<string, Promise<void>>();

export function runCourseImportValidationJob(jobId: string): Promise<void> {
  const existing = runningJobs.get(jobId);
  if (existing) {
    return existing;
  }

  const jobPromise = (async () => {
    try {
      await updateCourseImportJob(jobId, {
        status: 'running',
        step: 'validating',
        message: 'Validating course package',
      });

      const job = await readCourseImportJob(jobId);
      if (!job) {
        throw new Error(`Course import job not found: ${jobId}`);
      }

      const { validation, extracted } = await validateCourseImportPackage(job);

      await updateCourseImportJob(jobId, {
        status: 'validated',
        step: 'validated',
        message: 'Course package validated',
        validation,
        extracted,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Course import job ${jobId} failed:`, error);
      const existingJob = await readCourseImportJob(jobId);
      if (existingJob) {
        await updateCourseImportJob(jobId, {
          status: 'failed',
          step: 'failed',
          message: 'Course import validation failed',
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
