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

vi.mock('@/lib/server/classroom-regeneration-runner', () => ({
  runClassroomRegenerationJob: vi.fn(async (jobId: string) => {
    const { readClassroomRegenerationJob, updateClassroomRegenerationJob } = await import(
      '@/lib/server/classroom-regeneration-store'
    );
    const { readClassroom } = await import('@/lib/server/classroom-storage');
    const job = await readClassroomRegenerationJob(jobId);
    if (!job) return;
    const classroom = await readClassroom(job.classroomId);
    const scene = classroom?.scenes.find((item) => item.id === job.targetSceneIds[0]);
    if (!scene) return;

    await updateClassroomRegenerationJob(jobId, {
      status: 'preview-ready',
      step: 'preview-ready',
      message: 'Mock preview ready',
      preview: {
        stage: { lastRegeneratedAt: new Date().toISOString() },
        changedSceneIds: [scene.id],
        scenes: [
          {
            ...scene,
            title: `${scene.title} (Reworked)`,
            draftSource: 'regenerate',
            lastRegeneratedAt: new Date().toISOString(),
            generationContext: {
              retrievalContext: `Prompt: ${job.prompt}`,
              knowledgeVideoReferences: [],
            },
            updatedAt: Date.now(),
          },
        ],
      },
    });
  }),
}));

function buildStage(id: string): Stage {
  return {
    id,
    name: 'Editable Course',
    description: 'Classroom route test',
    language: 'en-US',
    style: 'professional',
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
      title: 'Original Title',
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
          elements: [],
        },
      },
      actions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}

describe('classroom patch, revision, and regeneration routes', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    scheduledCallbacks.length = 0;
    afterMock.mockClear();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-classroom-v2-route-test-');
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('creates a draft classroom when PATCH saves a local-only classroom for the first time', async () => {
    const classroomRoute = await import('@/app/api/classroom/[id]/route');
    const { readClassroom } = await import('@/lib/server/classroom-storage');

    const classroomId = 'local_only_course';
    const response = await classroomRoute.PATCH(
      createJsonRequest(`http://localhost/api/classroom/${classroomId}`, 'PATCH', {
        stage: buildStage('temporary_local_id'),
        scenes: buildScenes('temporary_local_id'),
        saveMode: 'draft',
      }),
      { params: Promise.resolve({ id: classroomId }) },
    );

    expect(response.status).toBe(200);
    const saved = await readClassroom(classroomId);
    expect(saved?.stage.id).toBe(classroomId);
    expect(saved?.stage.name).toBe('Editable Course');
    expect(saved?.stage.isDraft).toBe(true);
    expect(saved?.scenes[0].stageId).toBe(classroomId);
  });

  it('supports patch save, revision create/restore, and regeneration preview/apply/discard', async () => {
    const classroomRoute = await import('@/app/api/classroom/[id]/route');
    const revisionsRoute = await import('@/app/api/classroom/[id]/revisions/route');
    const restoreRevisionRoute = await import(
      '@/app/api/classroom/[id]/revisions/[revisionId]/restore/route'
    );
    const regenerateRoute = await import('@/app/api/classroom/[id]/regenerate/route');
    const regenerateStatusRoute = await import('@/app/api/classroom/[id]/regenerate/[jobId]/route');
    const regenerateApplyRoute = await import(
      '@/app/api/classroom/[id]/regenerate/[jobId]/apply/route'
    );
    const regenerateDiscardRoute = await import(
      '@/app/api/classroom/[id]/regenerate/[jobId]/discard/route'
    );
    const { persistClassroom, readClassroom } = await import('@/lib/server/classroom-storage');

    const classroomId = 'editable_course';
    await persistClassroom(
      {
        id: classroomId,
        stage: buildStage(classroomId),
        scenes: buildScenes(classroomId),
      },
      'http://localhost',
    );

    const patchResponse = await classroomRoute.PATCH(
      createJsonRequest(`http://localhost/api/classroom/${classroomId}`, 'PATCH', {
        stage: { name: 'Editable Course Draft' },
        scenes: [{ id: 'scene_1', title: 'Draft Title' }],
        saveMode: 'draft',
      }),
      { params: Promise.resolve({ id: classroomId }) },
    );
    expect(patchResponse.status).toBe(200);
    const patched = await readClassroom(classroomId);
    expect(patched?.stage.name).toBe('Editable Course Draft');
    expect(patched?.stage.isDraft).toBe(true);
    expect(patched?.scenes[0].title).toBe('Draft Title');

    const createRevisionResponse = await revisionsRoute.POST(
      createJsonRequest(`http://localhost/api/classroom/${classroomId}/revisions`, 'POST', {
        source: 'manual-save',
        summary: 'Draft checkpoint',
      }),
      { params: Promise.resolve({ id: classroomId }) },
    );
    expect(createRevisionResponse.status).toBe(201);
    const createRevisionBody = await createRevisionResponse.json();
    const revisionId = createRevisionBody.revision.id as string;

    const revisionsListResponse = await revisionsRoute.GET(
      createGetRequest(`http://localhost/api/classroom/${classroomId}/revisions?page=1&pageSize=10`),
      { params: Promise.resolve({ id: classroomId }) },
    );
    const revisionsListBody = await revisionsListResponse.json();
    expect(revisionsListBody.total).toBe(1);
    expect(revisionsListBody.revisions[0].summary).toBe('Draft checkpoint');

    await classroomRoute.PATCH(
      createJsonRequest(`http://localhost/api/classroom/${classroomId}`, 'PATCH', {
        stage: { name: 'Editable Course Published' },
        scenes: [{ id: 'scene_1', title: 'Published Title' }],
        saveMode: 'publish',
      }),
      { params: Promise.resolve({ id: classroomId }) },
    );

    const restoreResponse = await restoreRevisionRoute.POST(
      createJsonRequest(
        `http://localhost/api/classroom/${classroomId}/revisions/${revisionId}/restore`,
        'POST',
        {},
      ),
      { params: Promise.resolve({ id: classroomId, revisionId }) },
    );
    expect(restoreResponse.status).toBe(200);
    const restored = await readClassroom(classroomId);
    expect(restored?.stage.name).toBe('Editable Course Draft');
    expect(restored?.scenes[0].title).toBe('Draft Title');

    const regenerateCreateResponse = await regenerateRoute.POST(
      createJsonRequest(`http://localhost/api/classroom/${classroomId}/regenerate`, 'POST', {
        targetType: 'scene',
        targetId: 'scene_1',
        prompt: 'Make it more concise and modern',
        regenerateMode: 'full',
        preserveManualEdits: true,
        knowledgeBaseIds: [],
        memoryIds: [],
      }),
      { params: Promise.resolve({ id: classroomId }) },
    );
    expect(regenerateCreateResponse.status).toBe(202);
    const regenerateCreateBody = await regenerateCreateResponse.json();
    const regenerationJobId = regenerateCreateBody.jobId as string;
    expect(scheduledCallbacks).toHaveLength(1);
    await scheduledCallbacks[0]?.();

    const regenerateStatusResponse = await regenerateStatusRoute.GET(
      createGetRequest(
        `http://localhost/api/classroom/${classroomId}/regenerate/${regenerationJobId}`,
      ),
      { params: Promise.resolve({ id: classroomId, jobId: regenerationJobId }) },
    );
    const regenerateStatusBody = await regenerateStatusResponse.json();
    expect(regenerateStatusBody.job.status).toBe('preview-ready');
    expect(regenerateStatusBody.job.preview.scenes[0].title).toContain('(Reworked)');

    const applyResponse = await regenerateApplyRoute.POST(
      createJsonRequest(
        `http://localhost/api/classroom/${classroomId}/regenerate/${regenerationJobId}/apply`,
        'POST',
        { createRevision: true },
      ),
      { params: Promise.resolve({ id: classroomId, jobId: regenerationJobId }) },
    );
    expect(applyResponse.status).toBe(200);
    const regenerated = await readClassroom(classroomId);
    expect(regenerated?.scenes[0].title).toContain('(Reworked)');
    expect(regenerated?.stage.lastRegeneratedAt).toBeTruthy();

    const revisionsAfterApplyResponse = await revisionsRoute.GET(
      createGetRequest(`http://localhost/api/classroom/${classroomId}/revisions?page=1&pageSize=10`),
      { params: Promise.resolve({ id: classroomId }) },
    );
    const revisionsAfterApplyBody = await revisionsAfterApplyResponse.json();
    expect(revisionsAfterApplyBody.total).toBe(3);
    const appliedRevision = revisionsAfterApplyBody.revisions.find(
      (revision: { summary?: string }) => revision.summary === `Applied regeneration job ${regenerationJobId}`,
    );
    expect(appliedRevision).toBeTruthy();

    await restoreRevisionRoute.POST(
      createJsonRequest(
        `http://localhost/api/classroom/${classroomId}/revisions/${revisionId}/restore`,
        'POST',
        {},
      ),
      { params: Promise.resolve({ id: classroomId, revisionId }) },
    );
    const restoredDraft = await readClassroom(classroomId);
    expect(restoredDraft?.scenes[0].title).toBe('Draft Title');

    await restoreRevisionRoute.POST(
      createJsonRequest(
        `http://localhost/api/classroom/${classroomId}/revisions/${appliedRevision.id}/restore`,
        'POST',
        {},
      ),
      { params: Promise.resolve({ id: classroomId, revisionId: appliedRevision.id }) },
    );
    const restoredApplied = await readClassroom(classroomId);
    expect(restoredApplied?.scenes[0].title).toContain('(Reworked)');

    scheduledCallbacks.length = 0;
    afterMock.mockClear();
    const discardCreateResponse = await regenerateRoute.POST(
      createJsonRequest(`http://localhost/api/classroom/${classroomId}/regenerate`, 'POST', {
        targetType: 'scene',
        targetId: 'scene_1',
        prompt: 'Discard me',
        regenerateMode: 'text',
        preserveManualEdits: true,
        knowledgeBaseIds: [],
        memoryIds: [],
      }),
      { params: Promise.resolve({ id: classroomId }) },
    );
    const discardCreateBody = await discardCreateResponse.json();
    const discardJobId = discardCreateBody.jobId as string;
    await scheduledCallbacks[0]?.();

    const discardResponse = await regenerateDiscardRoute.POST(
      createJsonRequest(
        `http://localhost/api/classroom/${classroomId}/regenerate/${discardJobId}/discard`,
        'POST',
        {},
      ),
      { params: Promise.resolve({ id: classroomId, jobId: discardJobId }) },
    );
    const discardBody = await discardResponse.json();
    expect(discardBody.discarded).toBe(true);

    const discardedStatusResponse = await regenerateStatusRoute.GET(
      createGetRequest(`http://localhost/api/classroom/${classroomId}/regenerate/${discardJobId}`),
      { params: Promise.resolve({ id: classroomId, jobId: discardJobId }) },
    );
    const discardedStatusBody = await discardedStatusResponse.json();
    expect(discardedStatusBody.job.status).toBe('discarded');
  }, 20000);
});
