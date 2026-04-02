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

  it('preserves request generation config for background execution', async () => {
    const generateClassroomRoute = await import('@/app/api/generate-classroom/route');

    generateClassroomMock.mockResolvedValueOnce({
      id: 'classroom_configured',
      url: 'http://localhost/classroom/classroom_configured',
      stage: {
        id: 'classroom_configured',
        name: 'Configured Classroom',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      scenes: [],
      scenesCount: 0,
      createdAt: new Date().toISOString(),
    });

    const response = await generateClassroomRoute.POST(
      createJsonRequest(
        'http://localhost/api/generate-classroom',
        'POST',
        {
          type: 'course',
          requirement: 'Create a configured classroom',
          language: 'en-US',
          enableImageGeneration: true,
          enableVideoGeneration: true,
          enableTTS: true,
        },
        {
          'x-model': 'openai:gpt-4o-mini',
          'x-api-key': 'client-model-key',
          'x-base-url': 'https://example.invalid/llm',
          'x-provider-type': 'openai',
          'x-requires-api-key': 'true',
          'x-image-provider': 'seedream',
          'x-image-model': 'seedream-v1',
          'x-image-api-key': 'image-key',
          'x-image-base-url': 'https://example.invalid/image',
          'x-video-provider': 'seedance',
          'x-video-model': 'seedance-v1',
          'x-video-api-key': 'video-key',
          'x-video-base-url': 'https://example.invalid/video',
          'x-tts-provider': 'openai-tts',
          'x-tts-voice': 'alloy',
          'x-tts-speed': '1.25',
          'x-tts-api-key': 'tts-key',
          'x-tts-base-url': 'https://example.invalid/tts',
        },
      ),
    );

    expect(response.status).toBe(202);
    expect(scheduledCallbacks).toHaveLength(1);

    await scheduledCallbacks[0]?.();

    expect(generateClassroomMock).toHaveBeenCalledTimes(1);
    expect(generateClassroomMock.mock.calls[0]?.[0]).toMatchObject({
      modelConfig: {
        modelString: 'openai:gpt-4o-mini',
        apiKey: 'client-model-key',
        baseUrl: 'https://example.invalid/llm',
        providerType: 'openai',
        requiresApiKey: true,
      },
      mediaConfig: {
        imageProviderId: 'seedream',
        imageModel: 'seedream-v1',
        imageApiKey: 'image-key',
        imageBaseUrl: 'https://example.invalid/image',
        videoProviderId: 'seedance',
        videoModel: 'seedance-v1',
        videoApiKey: 'video-key',
        videoBaseUrl: 'https://example.invalid/video',
      },
      ttsConfig: {
        providerId: 'openai-tts',
        voice: 'alloy',
        speed: 1.25,
        apiKey: 'tts-key',
        baseUrl: 'https://example.invalid/tts',
      },
    });
  });
});
