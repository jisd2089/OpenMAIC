import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
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

function buildLongStageName(length: number): string {
  return `Course ${'x'.repeat(Math.max(0, length - 'Course '.length))}`;
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

  it('lists persisted classrooms via GET /api/classroom', async () => {
    const classroomCollectionRoute = await import('@/app/api/classroom/route');
    const { persistClassroom } = await import('@/lib/server/classroom-storage');

    await persistClassroom(
      {
        id: 'listed_course',
        stage: {
          ...buildStage('listed_course'),
          name: 'Listed Course',
          generationContext: {
            knowledgeBaseIds: ['kb_1'],
            memoryIds: ['mem_1', 'mem_2'],
            preferKnowledgeVideos: true,
          },
        },
        scenes: buildScenes('listed_course'),
      },
      'http://localhost',
    );

    const response = await classroomCollectionRoute.GET(createGetRequest('http://localhost/api/classroom'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.classrooms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'listed_course',
          name: 'Listed Course',
          sceneCount: 1,
          knowledgeBaseCount: 1,
          memoryCount: 2,
          preferKnowledgeVideos: true,
        }),
      ]),
    );
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

  it('truncates classroom titles to 30 characters when saving drafts', async () => {
    const classroomRoute = await import('@/app/api/classroom/[id]/route');
    const { persistClassroom, readClassroom } = await import('@/lib/server/classroom-storage');

    const classroomId = 'long_name_course';
    const longName = buildLongStageName(31);
    await persistClassroom(
      {
        id: classroomId,
        stage: {
          ...buildStage(classroomId),
          name: longName,
        },
        scenes: buildScenes(classroomId),
      },
      'http://localhost',
    );

    const patchResponse = await classroomRoute.PATCH(
      createJsonRequest(`http://localhost/api/classroom/${classroomId}`, 'PATCH', {
        stage: { name: longName, description: 'Draft save with long title' },
        scenes: [],
        saveMode: 'draft',
      }),
      { params: Promise.resolve({ id: classroomId }) },
    );

    expect(patchResponse.status).toBe(200);
    const saved = await readClassroom(classroomId);
    expect(saved?.stage.name).toBe(Array.from(longName).slice(0, 30).join(''));
    expect(Array.from(saved?.stage.name || '')).toHaveLength(30);
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

  it('deletes classroom data, revisions, and related jobs via DELETE /api/classroom/:id', async () => {
    const classroomRoute = await import('@/app/api/classroom/[id]/route');
    const { createCourseExportJob, courseExportJobDir, readCourseExportJob } = await import(
      '@/lib/server/classroom-export-store'
    );
    const { createClassroomRegenerationJob, readClassroomRegenerationJob } = await import(
      '@/lib/server/classroom-regeneration-store'
    );
    const {
      persistClassroom,
      readClassroom,
      classroomAudioDir,
      classroomMediaDir,
      classroomJsonPath,
      classroomRevisionsDir,
    } = await import('@/lib/server/classroom-storage');
    const { createClassroomRevision, listAllClassroomRevisions } = await import(
      '@/lib/server/classroom-revision-store'
    );

    const classroomId = 'delete_me_course';
    await persistClassroom(
      {
        id: classroomId,
        stage: buildStage(classroomId),
        scenes: buildScenes(classroomId),
      },
      'http://localhost',
    );

    await fs.mkdir(classroomMediaDir(classroomId), { recursive: true });
    await fs.mkdir(classroomAudioDir(classroomId), { recursive: true });
    await fs.writeFile(`${classroomMediaDir(classroomId)}\\preview.png`, Buffer.from('preview'));
    await fs.writeFile(`${classroomAudioDir(classroomId)}\\speech.mp3`, Buffer.from('speech'));

    await createClassroomRevision({
      classroomId,
      source: 'manual-save',
      summary: 'Delete checkpoint',
      stage: buildStage(classroomId),
      scenes: buildScenes(classroomId),
    });

    await createCourseExportJob({
      jobId: 'exp_delete_me',
      classroomId,
      includeAssets: true,
      includeContext: true,
      includeRevisions: true,
    });
    await fs.writeFile(`${courseExportJobDir('exp_delete_me')}\\artifact.zip`, Buffer.from('zip'));

    await createClassroomRegenerationJob({
      jobId: 'regen_delete_me',
      classroomId,
      targetType: 'scene',
      targetId: 'scene_1',
      targetSceneIds: ['scene_1'],
      regenerateMode: 'full',
      preserveManualEdits: true,
      prompt: 'Delete me',
      knowledgeBaseIds: [],
      memoryIds: [],
    });

    const deleteResponse = await classroomRoute.DELETE(
      createJsonRequest(`http://localhost/api/classroom/${classroomId}`, 'DELETE', {}),
      { params: Promise.resolve({ id: classroomId }) },
    );
    expect(deleteResponse.status).toBe(200);
    const deleteBody = await deleteResponse.json();
    expect(deleteBody.success).toBe(true);
    expect(deleteBody.classroomId).toBe(classroomId);
    expect(deleteBody.status).toBe('deleted');
    expect(typeof deleteBody.deletedAt).toBe('string');
    expect(Number.isNaN(Date.parse(deleteBody.deletedAt as string))).toBe(false);

    expect(await readClassroom(classroomId)).toBeNull();
    expect(await listAllClassroomRevisions(classroomId)).toHaveLength(0);
    expect(await readCourseExportJob('exp_delete_me')).toBeNull();
    expect(await readClassroomRegenerationJob('regen_delete_me')).toBeNull();

    await expect(fs.access(classroomJsonPath(classroomId))).rejects.toBeTruthy();
    await expect(fs.access(classroomRevisionsDir(classroomId))).rejects.toBeTruthy();
    await expect(fs.access(courseExportJobDir('exp_delete_me'))).rejects.toBeTruthy();
  });

  it('returns 404 when deleting a classroom that does not exist', async () => {
    const classroomRoute = await import('@/app/api/classroom/[id]/route');

    const response = await classroomRoute.DELETE(
      createJsonRequest('http://localhost/api/classroom/missing_course', 'DELETE', {}),
      { params: Promise.resolve({ id: 'missing_course' }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.errorCode).toBe('CLASSROOM_NOT_FOUND');
  });

  it('returns 400 when deleting a classroom with an invalid id', async () => {
    const classroomRoute = await import('@/app/api/classroom/[id]/route');

    const response = await classroomRoute.DELETE(
      createJsonRequest('http://localhost/api/classroom/invalid/id', 'DELETE', {}),
      { params: Promise.resolve({ id: 'invalid/id' }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errorCode).toBe('INVALID_REQUEST');
  });
});
