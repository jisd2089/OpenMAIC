import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
const runClassroomGenerationJobMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const getPreferredServerTTSProviderIdMock = vi.hoisted(() =>
  vi.fn<() => undefined>(() => undefined),
);

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: afterMock,
  };
});

vi.mock('@/lib/server/classroom-job-runner', () => ({
  runClassroomGenerationJob: runClassroomGenerationJobMock,
}));

vi.mock('@/lib/server/provider-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/provider-config')>(
    '@/lib/server/provider-config',
  );
  return {
    ...actual,
    getPreferredServerTTSProviderId: getPreferredServerTTSProviderIdMock,
  };
});

describe('generate-classroom route background job startup', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    scheduledCallbacks.length = 0;
    afterMock.mockClear();
    runClassroomGenerationJobMock.mockClear();
    getPreferredServerTTSProviderIdMock.mockReset();
    getPreferredServerTTSProviderIdMock.mockReturnValue(undefined);
    workspaceRoot = await setupIsolatedWorkspace('openmaic-generate-classroom-route-test-');
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('starts the generation runner immediately and keeps after() as a fallback', async () => {
    const generateClassroomRoute = await import('@/app/api/generate-classroom/route');

    const response = await generateClassroomRoute.POST(
      createJsonRequest('http://localhost/api/generate-classroom', 'POST', {
        type: 'course',
        requirement: '做五张PPT介绍小学语文',
        language: 'zh-CN',
        scopeId: 'scope-default',
        knowledgeBaseIds: [],
        memoryIds: [],
        enableKnowledgeRetrieval: false,
        enableMemoryRetrieval: false,
        preferKnowledgeVideos: false,
      }),
    );

    expect(response.status).toBe(202);
    expect(runClassroomGenerationJobMock).toHaveBeenCalledTimes(1);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(scheduledCallbacks).toHaveLength(1);

    await scheduledCallbacks[0]?.();
    expect(runClassroomGenerationJobMock).toHaveBeenCalledTimes(2);
  });
});
