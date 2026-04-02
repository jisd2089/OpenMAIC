import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGetRequest,
  createJsonRequest,
  setupIsolatedWorkspace,
  teardownIsolatedWorkspace,
} from './test-utils';
import type { GenerateClassroomInput, GenerateClassroomResult } from '@/lib/server/classroom-generation';

const scheduledCallbacks = vi.hoisted<Array<() => void | Promise<void>>>(() => []);
const afterMock = vi.hoisted(() =>
  vi.fn((callback: () => void | Promise<void>) => {
    scheduledCallbacks.push(callback);
  }),
);
const generateClassroomMock = vi.hoisted(() =>
  vi.fn<
    (
      input: GenerateClassroomInput,
      options: {
        baseUrl: string;
        classroomId: string;
        onProgress?: (progress: unknown) => Promise<void> | void;
      },
    ) => Promise<GenerateClassroomResult>
  >(),
);

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: afterMock,
  };
});

vi.mock('@/lib/server/classroom-generation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/classroom-generation')>(
    '@/lib/server/classroom-generation',
  );
  return {
    ...actual,
    generateClassroom: generateClassroomMock,
  };
});

describe('generate-classroom background job integration', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    scheduledCallbacks.length = 0;
    afterMock.mockClear();
    generateClassroomMock.mockReset();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-generate-classroom-job-test-');
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('creates a queued job, schedules background execution, and exposes poll status via routes', async () => {
    const generateClassroomRoute = await import('@/app/api/generate-classroom/route');
    const generateClassroomStatusRoute = await import('@/app/api/generate-classroom/[jobId]/route');
    const { readClassroomGenerationJob } = await import('@/lib/server/classroom-job-store');

    const requestBody = {
      type: 'knowledge' as const,
      requirement: 'Create a biology classroom about chloroplast energy flow',
      language: 'en-US' as const,
      scopeId: 'scope-job-route',
      knowledgeBaseIds: ['kb_alpha'],
      memoryIds: ['mem_alpha'],
      enableKnowledgeRetrieval: true,
      enableMemoryRetrieval: true,
      preferKnowledgeVideos: true,
    };

    const response = await generateClassroomRoute.POST(
      createJsonRequest('http://localhost/api/generate-classroom', 'POST', requestBody),
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('queued');
    expect(body.step).toBe('queued');
    expect(body.jobId).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(body.classroomId).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(body.pollUrl).toBe(`http://localhost/api/generate-classroom/${body.jobId}`);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(scheduledCallbacks).toHaveLength(1);

    const persisted = await readClassroomGenerationJob(body.jobId as string);
    expect(persisted).not.toBeNull();
    expect(persisted?.classroomId).toBe(body.classroomId);
    expect(persisted?.status).toBe('queued');
    expect(persisted?.inputSummary.type).toBe('knowledge');
    expect(persisted?.inputSummary.requirementPreview).toContain('chloroplast energy flow');
    expect(persisted?.inputSummary.language).toBe('en-US');

    const statusResponse = await generateClassroomStatusRoute.GET(
      createGetRequest(`http://localhost/api/generate-classroom/${body.jobId}`),
      { params: Promise.resolve({ jobId: body.jobId as string }) },
    );
    expect(statusResponse.status).toBe(200);
    const statusBody = await statusResponse.json();
    expect(statusBody.jobId).toBe(body.jobId);
    expect(statusBody.classroomId).toBe(body.classroomId);
    expect(statusBody.status).toBe('queued');
    expect(statusBody.done).toBe(false);
  }, 20000);

  it('persists runner progress and success result for generate-classroom jobs', async () => {
    const generateClassroomStatusRoute = await import('@/app/api/generate-classroom/[jobId]/route');
    const { createClassroomGenerationJob, readClassroomGenerationJob } = await import(
      '@/lib/server/classroom-job-store'
    );
    const { runClassroomGenerationJob } = await import('@/lib/server/classroom-job-runner');

    generateClassroomMock.mockImplementationOnce(async (_input, options) => {
      expect(options.classroomId).toBe('classroom_success');
      await options.onProgress?.({
        step: 'generating_outlines',
        progress: 35,
        message: 'Generating outlines',
        scenesGenerated: 0,
        totalScenes: 3,
      });
      await options.onProgress?.({
        step: 'generating_scenes',
        progress: 70,
        message: 'Generating scenes',
        scenesGenerated: 2,
        totalScenes: 3,
      });
      return {
        id: 'classroom_success',
        url: 'http://localhost/classroom/classroom_success',
        stage: {
          id: 'stage_success',
          name: 'Generated Classroom',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        scenes: [],
        scenesCount: 3,
        createdAt: new Date().toISOString(),
      };
    });

    const job = await createClassroomGenerationJob('job_success', {
      type: 'course',
      requirement: 'Teach ATP transfer',
      language: 'en-US',
    }, 'classroom_success');
    expect(job.status).toBe('queued');
    expect(job.classroomId).toBe('classroom_success');

    await runClassroomGenerationJob('job_success', { type: 'course', requirement: 'Teach ATP transfer', language: 'en-US' }, 'http://localhost');

    const persisted = await readClassroomGenerationJob('job_success');
    expect(persisted).not.toBeNull();
    expect(persisted?.classroomId).toBe('classroom_success');
    expect(persisted?.status).toBe('succeeded');
    expect(persisted?.step).toBe('completed');
    expect(persisted?.progress).toBe(100);
    expect(persisted?.scenesGenerated).toBe(3);
    expect(persisted?.totalScenes).toBe(3);
    expect(persisted?.result).toEqual({
      classroomId: 'classroom_success',
      url: 'http://localhost/classroom/classroom_success',
      scenesCount: 3,
    });

    const statusResponse = await generateClassroomStatusRoute.GET(
      createGetRequest('http://localhost/api/generate-classroom/job_success'),
      { params: Promise.resolve({ jobId: 'job_success' }) },
    );
    expect(statusResponse.status).toBe(200);
    const statusBody = await statusResponse.json();
    expect(statusBody.success).toBe(true);
    expect(statusBody.classroomId).toBe('classroom_success');
    expect(statusBody.status).toBe('succeeded');
    expect(statusBody.step).toBe('completed');
    expect(statusBody.done).toBe(true);
    expect(statusBody.result).toEqual({
      classroomId: 'classroom_success',
      url: 'http://localhost/classroom/classroom_success',
      scenesCount: 3,
    });
  });

  it('persists runner failures for generate-classroom jobs', async () => {
    const generateClassroomStatusRoute = await import('@/app/api/generate-classroom/[jobId]/route');
    const { createClassroomGenerationJob } = await import('@/lib/server/classroom-job-store');
    const { runClassroomGenerationJob } = await import('@/lib/server/classroom-job-runner');

    generateClassroomMock.mockRejectedValueOnce(new Error('model quota exhausted'));

    await createClassroomGenerationJob('job_failed', {
      type: 'course',
      requirement: 'Teach chloroplasts',
      language: 'en-US',
    });

    await runClassroomGenerationJob('job_failed', { type: 'course', requirement: 'Teach chloroplasts', language: 'en-US' }, 'http://localhost');

    const statusResponse = await generateClassroomStatusRoute.GET(
      createGetRequest('http://localhost/api/generate-classroom/job_failed'),
      { params: Promise.resolve({ jobId: 'job_failed' }) },
    );
    expect(statusResponse.status).toBe(200);
    const statusBody = await statusResponse.json();
    expect(statusBody.success).toBe(true);
    expect(statusBody.classroomId).toBeTruthy();
    expect(statusBody.status).toBe('failed');
    expect(statusBody.step).toBe('failed');
    expect(statusBody.done).toBe(true);
    expect(statusBody.error).toContain('model quota exhausted');
  });

  it('returns 404 for unknown generate-classroom job ids', async () => {
    const generateClassroomStatusRoute = await import('@/app/api/generate-classroom/[jobId]/route');

    const response = await generateClassroomStatusRoute.GET(
      createGetRequest('http://localhost/api/generate-classroom/job_missing'),
      { params: Promise.resolve({ jobId: 'job_missing' }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.errorCode).toBe('INVALID_REQUEST');
  });

  it('returns invalid request for malformed generate-classroom status job ids', async () => {
    const generateClassroomStatusRoute = await import('@/app/api/generate-classroom/[jobId]/route');

    const response = await generateClassroomStatusRoute.GET(
      createGetRequest('http://localhost/api/generate-classroom/invalid/job'),
      { params: Promise.resolve({ jobId: 'invalid/job' }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errorCode).toBe('INVALID_REQUEST');
  });

  it('defaults missing type to course and rejects invalid type values', async () => {
    const generateClassroomRoute = await import('@/app/api/generate-classroom/route');
    const { readClassroomGenerationJob } = await import('@/lib/server/classroom-job-store');

    const defaultedResponse = await generateClassroomRoute.POST(
      createJsonRequest('http://localhost/api/generate-classroom', 'POST', {
        requirement: 'Create a chemistry classroom about acids and bases',
        language: 'en-US',
      }),
    );

    expect(defaultedResponse.status).toBe(202);
    const defaultedBody = await defaultedResponse.json();
    const persisted = await readClassroomGenerationJob(defaultedBody.jobId as string);
    expect(persisted?.inputSummary.type).toBe('course');

    const invalidResponse = await generateClassroomRoute.POST(
      createJsonRequest('http://localhost/api/generate-classroom', 'POST', {
        type: 'invalid',
        requirement: 'Create a chemistry classroom about acids and bases',
        language: 'en-US',
      }),
    );

    expect(invalidResponse.status).toBe(400);
    const invalidBody = await invalidResponse.json();
    expect(invalidBody.errorCode).toBe('INVALID_REQUEST');
  });
});
