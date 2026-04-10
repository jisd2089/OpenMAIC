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
});
