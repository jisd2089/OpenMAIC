import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupIsolatedWorkspace, teardownIsolatedWorkspace } from './test-utils';

const generateClassroomMock = vi.hoisted(() => vi.fn());
const enqueueDifySyncMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/lib/server/classroom-generation', () => ({
  generateClassroom: generateClassroomMock,
}));

vi.mock('@/lib/server/publish/classroom-dify-sync', () => ({
  enqueueClassroomDifySync: enqueueDifySyncMock,
}));

describe('runClassroomGenerationJob dify trigger', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-classroom-job-dify-test-');
    generateClassroomMock.mockReset();
    enqueueDifySyncMock.mockReset();
    enqueueDifySyncMock.mockResolvedValue({
      status: 'completed',
      errorCode: null,
      errorMessage: null,
    });
    process.env.OPENMAIC_DIFY_ENABLED = 'true';
    process.env.OPENMAIC_DIFY_BASE_URL = 'https://difytestapi.zhizuobiao.com/v1';
    process.env.OPENMAIC_DIFY_API_KEY = 'test-key';
    process.env.OPENMAIC_DIFY_DATASET_ID = 'dataset_1';
    process.env.OPENMAIC_DIFY_DOCUMENT_NAME_TEMPLATE = '[{type}] {title} ({classroom})';
    const { resetDifyConfigCacheForTests } = await import('@/lib/server/publish/dify-config');
    resetDifyConfigCacheForTests();
  });

  afterEach(async () => {
    delete process.env.OPENMAIC_DIFY_ENABLED;
    delete process.env.OPENMAIC_DIFY_BASE_URL;
    delete process.env.OPENMAIC_DIFY_API_KEY;
    delete process.env.OPENMAIC_DIFY_DATASET_ID;
    delete process.env.OPENMAIC_DIFY_DOCUMENT_NAME_TEMPLATE;
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('enqueues dify sync after generation succeeds', async () => {
    const { createClassroomGenerationJob, readClassroomGenerationJob } = await import(
      '@/lib/server/classroom-job-store'
    );
    const { runClassroomGenerationJob } = await import('@/lib/server/classroom-job-runner');

    generateClassroomMock.mockResolvedValue({
      id: 'cls_generated',
      url: 'http://localhost/classroom/cls_generated',
      stage: { id: 'cls_generated', name: 'Generated', createdAt: 1, updatedAt: 1 },
      scenes: [],
      scenesCount: 3,
      createdAt: new Date().toISOString(),
    });

    await createClassroomGenerationJob('job_1', {
      type: 'knowledge',
      requirement: 'Teach linked lists',
      language: 'en-US',
    });

    await runClassroomGenerationJob('job_1', {
      type: 'knowledge',
      requirement: 'Teach linked lists',
      language: 'en-US',
    }, 'http://localhost');

    const job = await readClassroomGenerationJob('job_1');
    expect(job?.status).toBe('succeeded');
    expect(enqueueDifySyncMock).toHaveBeenCalledWith({
      classroomId: 'cls_generated',
      triggerSource: 'generate',
    });
  });

  it('waits for dify sync to start before finishing the generation runner', async () => {
    const { createClassroomGenerationJob } = await import('@/lib/server/classroom-job-store');
    const { runClassroomGenerationJob } = await import('@/lib/server/classroom-job-runner');

    generateClassroomMock.mockResolvedValue({
      id: 'cls_wait_sync',
      url: 'http://localhost/classroom/cls_wait_sync',
      stage: { id: 'cls_wait_sync', name: 'Generated', createdAt: 1, updatedAt: 1 },
      scenes: [],
      scenesCount: 2,
      createdAt: new Date().toISOString(),
    });

    let resolveSync: ((value: unknown) => void) | undefined;
    const syncPromise = new Promise((resolve) => {
      resolveSync = resolve;
    });
    enqueueDifySyncMock.mockImplementationOnce(() => syncPromise);

    await createClassroomGenerationJob('job_wait_sync', {
      type: 'course',
      requirement: 'Teach fractions',
      language: 'zh-CN',
    });

    let runnerFinished = false;
    const runnerPromise = runClassroomGenerationJob(
      'job_wait_sync',
      {
        type: 'course',
        requirement: 'Teach fractions',
        language: 'zh-CN',
      },
      'http://localhost',
    ).then(() => {
      runnerFinished = true;
    });

    await vi.waitFor(() =>
      expect(enqueueDifySyncMock).toHaveBeenCalledWith({
        classroomId: 'cls_wait_sync',
        triggerSource: 'generate',
      }),
    );
    expect(runnerFinished).toBe(false);

    resolveSync?.({
      status: 'completed',
      errorCode: null,
      errorMessage: null,
    });

    await runnerPromise;
    expect(runnerFinished).toBe(true);
  });
});
