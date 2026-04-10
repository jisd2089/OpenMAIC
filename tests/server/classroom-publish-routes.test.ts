import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';
import {
  createGetRequest,
  createJsonRequest,
  setupIsolatedWorkspace,
  teardownIsolatedWorkspace,
} from './test-utils';

const scheduledCallbacks = vi.hoisted<Array<() => void | Promise<void>>>(() => []);
const afterMock = vi.hoisted(() =>
  vi.fn((callback: () => void | Promise<void>) => {
    scheduledCallbacks.push(callback);
  }),
);

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: afterMock,
  };
});

function buildStage(id: string): Stage {
  return {
    id,
    name: 'C语言数据结构',
    language: 'zh-CN',
    style: 'professional',
    generationContext: {
      classroomType: 'knowledge',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildScenes(stageId: string): Scene[] {
  return [
    {
      id: 'scene_1',
      stageId,
      type: 'slide',
      title: '顺序表',
      order: 0,
      content: {
        type: 'slide',
        canvas: {
          id: 'slide_1',
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: {
            backgroundColor: '#ffffff',
            themeColors: ['#2563eb'],
            fontColor: '#111827',
            fontName: 'Microsoft YaHei',
          },
          elements: [
            {
              id: 'text_1',
              type: 'text',
              content: '顺序表采用连续存储结构，支持按下标随机访问。',
            } as never,
          ],
        },
      },
      actions: [
        {
          id: 'speech_1',
          type: 'speech',
          text: '顺序表适合读多写少的典型场景。',
        },
      ],
    },
  ];
}

describe('classroom publish routes', () => {
  let workspaceRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    scheduledCallbacks.length = 0;
    afterMock.mockClear();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-classroom-publish-route-test-');

    process.env.OPENMAIC_DIFY_ENABLED = 'true';
    process.env.OPENMAIC_DIFY_BASE_URL = 'https://difytestapi.zhizuobiao.com/v1';
    process.env.OPENMAIC_DIFY_API_KEY = 'test-key';
    process.env.OPENMAIC_DIFY_DATASET_ID = 'dataset_1';
    process.env.OPENMAIC_DIFY_DOCUMENT_NAME_TEMPLATE = '[{type}] {title} ({classroom})';
    process.env.OPENMAIC_DIFY_POLLING_INTERVAL_MS = '1';
    process.env.OPENMAIC_DIFY_MAX_POLLING_ATTEMPTS = '2';

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';

      if (url.endsWith('/datasets/dataset_1/document/create-by-text') && method === 'POST') {
        return new Response(
          JSON.stringify({
            document: {
              id: 'document_1',
              name: '[knowledge] C璇█鏁版嵁缁撴瀯 (cls_publish)',
              created_at: 1741267200,
            },
            batch: 'batch_1',
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/datasets/dataset_1/metadata') && method === 'GET') {
        return new Response(JSON.stringify({ doc_metadata: [] }), { status: 200 });
      }

      if (url.endsWith('/datasets/dataset_1/metadata') && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}')) as { name: string };
        return new Response(
          JSON.stringify({
            id: `${body.name}_id`,
            name: body.name,
            type: 'string',
          }),
          { status: 201 },
        );
      }

      if (url.endsWith('/datasets/dataset_1/documents/metadata') && method === 'POST') {
        return new Response(JSON.stringify({ result: 'success' }), { status: 200 });
      }

      if (
        url.endsWith('/datasets/dataset_1/documents/batch_1/indexing-status') &&
        method === 'GET'
      ) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'document_1', indexing_status: 'completed', error: null }],
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { resetDifyConfigCacheForTests } = await import('@/lib/server/publish/dify-config');
    resetDifyConfigCacheForTests();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.OPENMAIC_DIFY_ENABLED;
    delete process.env.OPENMAIC_DIFY_BASE_URL;
    delete process.env.OPENMAIC_DIFY_API_KEY;
    delete process.env.OPENMAIC_DIFY_DATASET_ID;
    delete process.env.OPENMAIC_DIFY_DOCUMENT_NAME_TEMPLATE;
    delete process.env.OPENMAIC_DIFY_POLLING_INTERVAL_MS;
    delete process.env.OPENMAIC_DIFY_MAX_POLLING_ATTEMPTS;
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('returns idle status before any publish attempt', async () => {
    const statusRoute = await import('@/app/api/classroom/[id]/publish-status/route');
    const { persistClassroom } = await import('@/lib/server/classroom-storage');

    await persistClassroom(
      {
        id: 'cls_publish',
        stage: buildStage('cls_publish'),
        scenes: buildScenes('cls_publish'),
      },
      'http://localhost',
    );

    const response = await statusRoute.GET(
      createGetRequest('http://localhost/api/classroom/cls_publish/publish-status'),
      { params: Promise.resolve({ id: 'cls_publish' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targets[0]).toMatchObject({
      provider: 'dify',
      enabled: true,
      status: 'idle',
      metadata: {
        classroom: 'cls_publish',
        type: 'knowledge',
        title: 'C语言数据结构',
      },
    });
  });

  it('schedules dify sync after classroom publish and reports completed status', async () => {
    const classroomRoute = await import('@/app/api/classroom/[id]/route');
    const statusRoute = await import('@/app/api/classroom/[id]/publish-status/route');
    const manualRoute = await import('@/app/api/classroom/[id]/publish/dify/route');
    const { persistClassroom } = await import('@/lib/server/classroom-storage');

    await persistClassroom(
      {
        id: 'cls_publish',
        stage: buildStage('cls_publish'),
        scenes: buildScenes('cls_publish'),
      },
      'http://localhost',
    );

    const publishResponse = await classroomRoute.PATCH(
      createJsonRequest('http://localhost/api/classroom/cls_publish', 'PATCH', {
        stage: { name: 'C语言数据结构' },
        scenes: buildScenes('cls_publish'),
        saveMode: 'publish',
      }),
      { params: Promise.resolve({ id: 'cls_publish' }) },
    );

    expect(publishResponse.status).toBe(200);
    expect(scheduledCallbacks).toHaveLength(1);

    await scheduledCallbacks[0]?.();

    const statusResponse = await statusRoute.GET(
      createGetRequest('http://localhost/api/classroom/cls_publish/publish-status'),
      { params: Promise.resolve({ id: 'cls_publish' }) },
    );
    const statusBody = await statusResponse.json();

    expect(statusBody.targets[0]).toMatchObject({
      status: 'completed',
      triggerSource: 'publish',
      batchId: 'batch_1',
      remoteIndexingStatus: 'completed',
      documentId: 'document_1',
      documentName: '[knowledge] C璇█鏁版嵁缁撴瀯 (cls_publish)',
      metadata: {
        classroom: 'cls_publish',
        type: 'knowledge',
        title: 'C语言数据结构',
      },
    });

    scheduledCallbacks.length = 0;
    const manualResponse = await manualRoute.POST(
      createJsonRequest('http://localhost/api/classroom/cls_publish/publish/dify', 'POST', {
        force: false,
      }),
      { params: Promise.resolve({ id: 'cls_publish' }) },
    );

    expect(manualResponse.status).toBe(202);
    expect(scheduledCallbacks).toHaveLength(1);

    await scheduledCallbacks[0]?.();

    const skippedStatus = await statusRoute.GET(
      createGetRequest('http://localhost/api/classroom/cls_publish/publish-status'),
      { params: Promise.resolve({ id: 'cls_publish' }) },
    );
    const skippedBody = await skippedStatus.json();

    expect(skippedBody.targets[0]).toMatchObject({
      status: 'skipped',
      triggerSource: 'manual',
      documentId: 'document_1',
    });
  });

  it('recreates the dify document when the bound remote document is missing', async () => {
    const manualRoute = await import('@/app/api/classroom/[id]/publish/dify/route');
    const statusRoute = await import('@/app/api/classroom/[id]/publish-status/route');
    const { persistClassroom } = await import('@/lib/server/classroom-storage');
    const { writeClassroomDifySyncRecord } = await import('@/lib/server/publish/classroom-publish-store');

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';

      if (url.endsWith('/datasets/dataset_1/documents/document_missing') && method === 'GET') {
        return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
      }

      if (url.endsWith('/datasets/dataset_1/document/create-by-text') && method === 'POST') {
        return new Response(
          JSON.stringify({
            document: {
              id: 'document_recreated',
              name: '[knowledge] C璇█鏁版嵁缁撴瀯 (cls_publish_missing)',
              created_at: 1741267300,
            },
            batch: 'batch_recreated',
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/datasets/dataset_1/metadata') && method === 'GET') {
        return new Response(JSON.stringify({ doc_metadata: [] }), { status: 200 });
      }

      if (url.endsWith('/datasets/dataset_1/metadata') && method === 'POST') {
        const body = JSON.parse(String(init?.body || '{}')) as { name: string };
        return new Response(
          JSON.stringify({
            id: `${body.name}_id`,
            name: body.name,
            type: 'string',
          }),
          { status: 201 },
        );
      }

      if (url.endsWith('/datasets/dataset_1/documents/metadata') && method === 'POST') {
        return new Response(JSON.stringify({ result: 'success' }), { status: 200 });
      }

      if (url.endsWith('/datasets/dataset_1/documents/batch_recreated/indexing-status') && method === 'GET') {
        return new Response(
          JSON.stringify({
            data: [{ id: 'document_recreated', indexing_status: 'completed', error: null }],
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    await persistClassroom(
      {
        id: 'cls_publish_missing',
        stage: buildStage('cls_publish_missing'),
        scenes: buildScenes('cls_publish_missing'),
      },
      'http://localhost',
    );

    await writeClassroomDifySyncRecord({
      classroomId: 'cls_publish_missing',
      provider: 'dify',
      enabled: true,
      status: 'completed',
      targetBaseUrl: 'https://difytestapi.zhizuobiao.com/v1',
      datasetId: 'dataset_1',
      documentId: 'document_missing',
      documentName: '[knowledge] old name',
      documentCreatedAt: '2026-01-01T00:00:00.000Z',
      triggerSource: 'generate',
      metadata: {
        classroom: 'cls_publish_missing',
        type: 'knowledge',
        title: 'C璇█鏁版嵁缁撴瀯',
      },
      batchId: 'batch_old',
      contentHash: 'old_hash',
      remoteIndexingStatus: 'completed',
      lastAttemptAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const manualResponse = await manualRoute.POST(
      createJsonRequest('http://localhost/api/classroom/cls_publish_missing/publish/dify', 'POST', {
        force: true,
      }),
      { params: Promise.resolve({ id: 'cls_publish_missing' }) },
    );

    expect(manualResponse.status).toBe(202);
    expect(scheduledCallbacks).toHaveLength(1);

    await scheduledCallbacks[0]?.();

    const statusResponse = await statusRoute.GET(
      createGetRequest('http://localhost/api/classroom/cls_publish_missing/publish-status'),
      { params: Promise.resolve({ id: 'cls_publish_missing' }) },
    );
    const statusBody = await statusResponse.json();

    expect(statusBody.targets[0]).toMatchObject({
      status: 'completed',
      triggerSource: 'manual',
      documentId: 'document_recreated',
      documentName: '[knowledge] C璇█鏁版嵁缁撴瀯 (cls_publish_missing)',
      batchId: 'batch_recreated',
    });
  });
});
