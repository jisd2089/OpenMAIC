import path from 'path';
import { createLogger } from '@/lib/logger';
import type { CreateCourseExportJobInput } from '@/lib/server/classroom/contracts';
import { generateCourseExportPackage } from '@/lib/server/course-export';
import {
  courseExportJobDir,
  readCourseExportJob,
  updateCourseExportJob,
} from '@/lib/server/classroom-export-store';

const log = createLogger('CourseExportJob');
const runningJobs = new Map<string, Promise<void>>();

export function runCourseExportJob(
  jobId: string,
  classroomId: string,
  options: CreateCourseExportJobInput,
  baseUrl: string,
): Promise<void> {
  const existing = runningJobs.get(jobId);
  if (existing) {
    log.info(`Course export job ${jobId} is already running`);
    return existing;
  }

  const jobPromise = (async () => {
    try {
      const existingJob = await readCourseExportJob(jobId);
      if (!existingJob) {
        log.warn(`Course export job ${jobId} not found before execution`);
        return;
      }
      if (existingJob.status === 'succeeded') {
        log.info(`Course export job ${jobId} already completed`);
        return;
      }
      if (existingJob.status === 'failed') {
        log.info(`Course export job ${jobId} already failed`);
        return;
      }

      log.info(`Starting course export job ${jobId}`, {
        classroomId,
        includeAssets: options.includeAssets,
        includeContext: options.includeContext,
        includeRevisions: options.includeRevisions,
      });
      await updateCourseExportJob(jobId, {
        status: 'running',
        step: 'packaging',
        message: 'Packaging course export',
      });

      const { result, warning } = await generateCourseExportPackage({
        classroomId,
        jobId,
        options,
        jobDir: courseExportJobDir(jobId),
        baseUrl,
      });

      await updateCourseExportJob(jobId, {
        status: 'succeeded',
        step: 'completed',
        message: warning || 'Course export completed',
        warning,
        filePath: path.join(courseExportJobDir(jobId), result.fileName),
        result,
      });
      log.info(`Course export job ${jobId} completed`, {
        classroomId,
        fileName: result.fileName,
        downloadUrl: result.downloadUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Course export job ${jobId} failed:`, error);
      const existingJob = await readCourseExportJob(jobId);
      if (existingJob) {
        await updateCourseExportJob(jobId, {
          status: 'failed',
          step: 'failed',
          message: 'Course export failed',
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
