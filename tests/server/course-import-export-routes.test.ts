import { promises as fs } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';
import {
  createFormRequest,
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
    name: 'Course Package Test',
    description: 'Import/export route integration test',
    language: 'en-US',
    style: 'scientific',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    generationContext: {
      scopeId: 'scope-course-package',
      knowledgeBaseIds: ['kb_1'],
      memoryIds: ['mem_1'],
      selectedKnowledgeBases: [{ id: 'kb_1', name: 'Biology KB' }],
      selectedMemories: [
        {
          id: 'mem_1',
          category: 'fact',
          contentPreview: 'ATP conversion reminder',
        },
      ],
      enableKnowledgeRetrieval: true,
      enableMemoryRetrieval: true,
      preferKnowledgeVideos: true,
    },
  };
}

function buildScenes(stageId: string): Scene[] {
  return [
    {
      id: 'scene_1',
      stageId,
      type: 'slide',
      title: 'Energy Flow',
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
              id: 'img_energy',
              type: 'image',
              x: 100,
              y: 140,
              w: 320,
              h: 180,
              src: `/api/classroom-media/${stageId}/media/energy.png`,
            },
          ],
        },
      } as unknown as Scene['content'],
      actions: [
        {
          id: 'speech_1',
          type: 'speech',
          title: 'Narration',
          text: 'Energy conversion narration',
          audioId: 'tts_speech_1',
          audioUrl: `/api/classroom-media/${stageId}/audio/narration.mp3`,
        },
      ] as Scene['actions'],
      generationContext: {
        retrievalContext: 'Knowledge Text: ATP conversion context',
        knowledgeVideoReferences: [],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}

describe('course import/export route integration', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    scheduledCallbacks.length = 0;
    afterMock.mockClear();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-course-package-route-test-');
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('exports classroom structure, assets, and revisions and imports them back as a new classroom', async () => {
    const exportRoute = await import('@/app/api/classroom/[id]/export/route');
    const exportStatusRoute = await import('@/app/api/classroom/[id]/export/[jobId]/route');
    const exportDownloadRoute = await import('@/app/api/classroom/[id]/export/[jobId]/download/route');
    const importRoute = await import('@/app/api/classroom/import/route');
    const importStatusRoute = await import('@/app/api/classroom/import/[jobId]/route');
    const importApplyRoute = await import('@/app/api/classroom/import/[jobId]/apply/route');
    const {
      persistClassroom,
      readClassroom,
      classroomMediaDir,
      classroomAudioDir,
    } = await import('@/lib/server/classroom-storage');
    const {
      createClassroomRevision,
      listAllClassroomRevisions,
    } = await import('@/lib/server/classroom-revision-store');

    const originalId = 'course_package_source';
    const persisted = await persistClassroom(
      {
        id: originalId,
        stage: buildStage(originalId),
        scenes: buildScenes(originalId),
      },
      'http://localhost',
    );
    expect(persisted.id).toBe(originalId);

    await fs.mkdir(classroomMediaDir(originalId), { recursive: true });
    await fs.mkdir(classroomAudioDir(originalId), { recursive: true });
    await fs.writeFile(`${classroomMediaDir(originalId)}\\energy.png`, Buffer.from('image-bytes'));
    await fs.writeFile(`${classroomAudioDir(originalId)}\\narration.mp3`, Buffer.from('audio-bytes'));

    await createClassroomRevision({
      classroomId: originalId,
      source: 'manual-save',
      summary: 'Initial revision',
      stage: buildStage(originalId),
      scenes: buildScenes(originalId),
    });

    const exportCreateResponse = await exportRoute.POST(
      createJsonRequest(`http://localhost/api/classroom/${originalId}/export`, 'POST', {
        includeAssets: true,
        includeContext: true,
        includeRevisions: true,
      }),
      { params: Promise.resolve({ id: originalId }) },
    );
    expect(exportCreateResponse.status).toBe(202);
    const exportCreateBody = await exportCreateResponse.json();
    expect(exportCreateBody.success).toBe(true);
    expect(afterMock).toHaveBeenCalledTimes(1);
    await scheduledCallbacks[0]?.();

    const exportStatusResponse = await exportStatusRoute.GET(
      createGetRequest(`http://localhost/api/classroom/${originalId}/export/${exportCreateBody.jobId}`),
      { params: Promise.resolve({ id: originalId, jobId: exportCreateBody.jobId as string }) },
    );
    const exportStatusBody = await exportStatusResponse.json();
    expect(exportStatusBody.job.status).toBe('succeeded');
    expect(exportStatusBody.job.result.manifest.assetCount).toBe(2);
    expect(exportStatusBody.job.result.manifest.includesAssets).toBe(true);

    const exportDownloadResponse = await exportDownloadRoute.GET(
      createGetRequest(
        `http://localhost/api/classroom/${originalId}/export/${exportCreateBody.jobId}/download`,
      ),
      { params: Promise.resolve({ id: originalId, jobId: exportCreateBody.jobId as string }) },
    );
    expect(exportDownloadResponse.status).toBe(200);
    expect(exportDownloadResponse.headers.get('content-disposition')).toContain(
      'filename="Course Package Test.omaic-course.zip"',
    );
    expect(exportDownloadResponse.headers.get('content-disposition')).toContain("filename*=UTF-8''");
    const packageBuffer = Buffer.from(await exportDownloadResponse.arrayBuffer());
    expect(packageBuffer.length).toBeGreaterThan(0);

    scheduledCallbacks.length = 0;
    afterMock.mockClear();

    const formData = new FormData();
    formData.set(
      'file',
      new File([packageBuffer], 'Course Package Test.omaic-course.zip', {
        type: 'application/zip',
      }),
    );
    formData.set('strategy', 'create-new');

    const importCreateResponse = await importRoute.POST(
      createFormRequest('http://localhost/api/classroom/import', 'POST', formData),
    );
    expect(importCreateResponse.status).toBe(202);
    const importCreateBody = await importCreateResponse.json();
    expect(afterMock).toHaveBeenCalledTimes(1);
    await scheduledCallbacks[0]?.();

    const importStatusResponse = await importStatusRoute.GET(
      createGetRequest(`http://localhost/api/classroom/import/${importCreateBody.jobId}`),
      { params: Promise.resolve({ jobId: importCreateBody.jobId as string }) },
    );
    const importStatusBody = await importStatusResponse.json();
    expect(importStatusBody.job.status).toBe('validated');
    expect(importStatusBody.job.validation.manifest.assetCount).toBe(2);

    const applyResponse = await importApplyRoute.POST(
      createJsonRequest(
        `http://localhost/api/classroom/import/${importCreateBody.jobId}/apply`,
        'POST',
        { courseNameOverride: 'Imported Course Package Test' },
      ),
      { params: Promise.resolve({ jobId: importCreateBody.jobId as string }) },
    );
    const applyBody = await applyResponse.json();
    expect(applyBody.classroomId).not.toBe(originalId);

    const importedId = applyBody.classroomId as string;
    const imported = await readClassroom(importedId);
    expect(imported?.stage.name).toBe('Imported Course Package Test');
    expect(imported?.scenes[0].stageId).toBe(importedId);
    expect(JSON.stringify(imported?.scenes[0])).toContain(`/api/classroom-media/${importedId}/media/energy.png`);
    expect(JSON.stringify(imported?.scenes[0])).toContain(`/api/classroom-media/${importedId}/audio/narration.mp3`);

    await expect(fs.readFile(`${classroomMediaDir(importedId)}\\energy.png`, 'utf-8')).resolves.toBe(
      'image-bytes',
    );
    await expect(fs.readFile(`${classroomAudioDir(importedId)}\\narration.mp3`, 'utf-8')).resolves.toBe(
      'audio-bytes',
    );

    const revisions = await listAllClassroomRevisions(importedId);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.summary).toBe('Initial revision');
    expect(JSON.stringify(revisions[0]?.scenes[0])).toContain(
      `/api/classroom-media/${importedId}/media/energy.png`,
    );
  }, 20000);
});

