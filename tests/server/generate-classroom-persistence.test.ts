import path from 'path';
import { promises as fs } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupIsolatedWorkspace, teardownIsolatedWorkspace } from './test-utils';

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: vi.fn(() => ({
    model: {},
    modelInfo: {
      capabilities: {
        vision: false,
      },
      outputWindow: 4096,
    },
    modelString: 'openai:test-model',
  })),
}));

vi.mock('@/lib/server/provider-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/provider-config')>(
    '@/lib/server/provider-config',
  );
  return {
    ...actual,
    resolveApiKey: vi.fn(() => 'test-api-key'),
    resolveWebSearchApiKey: vi.fn(() => undefined),
  };
});

vi.mock('@/lib/ai/providers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/providers')>('@/lib/ai/providers');
  return {
    ...actual,
    parseModelString: vi.fn(() => ({
      providerId: 'openai',
      modelId: 'test-model',
    })),
  };
});

vi.mock('@/lib/ai/llm', () => ({
  callLLM: vi.fn(async () => ({ text: 'unused' })),
}));

vi.mock('@/lib/generation/outline-generator', () => ({
  applyOutlineFallbacks: vi.fn((outline) => outline),
  generateSceneOutlinesFromRequirements: vi.fn(async () => ({
    success: true,
    data: [
      {
        id: 'outline_1',
        type: 'slide',
        title: 'Chloroplast Energy Flow',
        description: 'Explain how chloroplasts and ATP connect.',
        keyPoints: ['chloroplast', 'ATP'],
        order: 1,
        language: 'en-US',
      },
    ],
  })),
}));

vi.mock('@/lib/generation/scene-generator', () => ({
  generateSceneContent: vi.fn(async () => ({
    type: 'slide',
    canvas: {
      id: 'slide_persist_1',
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
  })),
  generateSceneActions: vi.fn(async () => [
    {
      id: 'action_1',
      type: 'speech',
      agentId: 'teacher',
      text: 'Discuss chloroplast energy transfer.',
    },
  ]),
  createSceneWithActions: vi.fn((outline, content, actions, api) => {
    const result = api.scene.create({
      type: outline.type,
      title: outline.title,
      order: outline.order,
      content,
      actions,
    });
    return result.success ? result.data : null;
  }),
}));

vi.mock('@/lib/server/classroom-media-generation', () => ({
  generateMediaForClassroom: vi.fn(async () => ({})),
  replaceMediaPlaceholders: vi.fn(),
  generateTTSForClassroom: vi.fn(async () => undefined),
}));

vi.mock('@/lib/server/video-processing', () => ({
  extractVideoMetadata: vi.fn(async () => ({
    durationMs: 42000,
    width: 1280,
    height: 720,
  })),
  generateVideoPoster: vi.fn(async () => false),
  extractVideoAudio: vi.fn(async () => false),
}));

describe('generate-classroom persistence integration', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-generate-classroom-persist-test-');
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('persists generated classroom data and generation context after background completion', async () => {
    const { getKnowledgeBaseService } = await import('@/lib/server/kb/service');
    const { getMemoryService } = await import('@/lib/server/memory/service');
    const { createClassroomGenerationJob, readClassroomGenerationJob } = await import(
      '@/lib/server/classroom-job-store'
    );
    const { readClassroom } = await import('@/lib/server/classroom-storage');
    const { runClassroomGenerationJob } = await import('@/lib/server/classroom-job-runner');

    const kbService = getKnowledgeBaseService();
    const memoryService = getMemoryService();

    const knowledgeBase = await kbService.createKnowledgeBase({
      scopeId: 'scope-classroom-persist',
      name: 'Persistence KB',
      description: 'Knowledge sources for persistence test',
    });

    await kbService.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'chloroplast-notes.txt',
      fileSize: 64,
      mimeType: 'text/plain',
      autoIngest: true,
      file: new File(
        ['Chloroplasts capture light energy and transfer it into ATP-related compounds.'],
        'chloroplast-notes.txt',
        { type: 'text/plain' },
      ),
    });

    const videoFile = await kbService.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'chloroplast-video.mp4',
      fileSize: 16,
      mimeType: 'video/mp4',
      autoIngest: true,
      file: new File([Buffer.from('fake-video')], 'chloroplast-video.mp4', { type: 'video/mp4' }),
    });

    await fs.writeFile(
      path.join(
        workspaceRoot,
        'data',
        'uploads',
        'knowledge',
        'scope-classroom-persist',
        knowledgeBase.slug,
        'files',
        `${videoFile.id}.srt`,
      ),
      `1
00:00:00,000 --> 00:00:02,000
Chloroplast video transcript about ATP conversion.
`,
      'utf-8',
    );
    await kbService.reindexKnowledgeFile(knowledgeBase.id, videoFile.id);

    const memoryNote = await memoryService.createMemoryNote({
      scopeId: 'scope-classroom-persist',
      content: 'Memory note: explicitly mention ATP conversion during chloroplast explanation.',
      category: 'fact',
      keywords: ['ATP'],
      tags: ['biology'],
      metadata: { source: 'persistence-test' },
    });

    const createdJob = await createClassroomGenerationJob('job_persisted_classroom', {
      type: 'knowledge',
      requirement: 'Build a chloroplast energy lesson',
      language: 'en-US',
      scopeId: 'scope-classroom-persist',
      knowledgeBaseIds: [knowledgeBase.id],
      memoryIds: [memoryNote.id],
      enableKnowledgeRetrieval: true,
      enableMemoryRetrieval: true,
      preferKnowledgeVideos: true,
      selectedKnowledgeBases: [{ id: knowledgeBase.id, name: knowledgeBase.name }],
      selectedMemories: [
        {
          id: memoryNote.id,
          category: memoryNote.category,
          contentPreview: memoryNote.content.slice(0, 60),
        },
      ],
    });
    expect(createdJob.classroomId).toBeTruthy();

    await runClassroomGenerationJob(
      'job_persisted_classroom',
      {
        type: 'knowledge',
        requirement: 'Build a chloroplast energy lesson',
        language: 'en-US',
        scopeId: 'scope-classroom-persist',
        knowledgeBaseIds: [knowledgeBase.id],
        memoryIds: [memoryNote.id],
        enableKnowledgeRetrieval: true,
        enableMemoryRetrieval: true,
        preferKnowledgeVideos: true,
        selectedKnowledgeBases: [{ id: knowledgeBase.id, name: knowledgeBase.name }],
        selectedMemories: [
          {
            id: memoryNote.id,
            category: memoryNote.category,
            contentPreview: memoryNote.content.slice(0, 60),
          },
        ],
      },
      'http://localhost',
    );

    const job = await readClassroomGenerationJob('job_persisted_classroom');
    expect(job?.status).toBe('succeeded');
    expect(job?.classroomId).toBe(createdJob.classroomId);
    expect(job?.result?.classroomId).toBeTruthy();
    expect(job?.result?.classroomId).toBe(createdJob.classroomId);
    expect(job?.result?.url).toBe(`http://localhost/classroom/${job?.result?.classroomId}`);

    const persisted = await readClassroom(job!.result!.classroomId);
    expect(persisted).not.toBeNull();
    expect(persisted?.id).toBe(job?.result?.classroomId);
    expect(persisted?.stage.id).toBe(job?.result?.classroomId);
    expect(persisted?.stage.language).toBe('en-US');
    expect(persisted?.stage.generationContext).toMatchObject({
      scopeId: 'scope-classroom-persist',
      knowledgeBaseIds: [knowledgeBase.id],
      memoryIds: [memoryNote.id],
      enableKnowledgeRetrieval: true,
      enableMemoryRetrieval: true,
      preferKnowledgeVideos: true,
      selectedKnowledgeBases: [{ id: knowledgeBase.id, name: knowledgeBase.name }],
    });

    expect(persisted?.scenes).toHaveLength(1);
    expect(persisted?.scenes[0].title).toBe('Chloroplast Energy Flow');
    expect(persisted?.scenes[0].generationContext?.retrievalContext).toContain('Knowledge Text');
    expect(persisted?.scenes[0].generationContext?.retrievalContext).toContain('Memory:fact');
    expect(String(persisted?.scenes[0].generationContext?.retrievalContext).toLowerCase()).toContain(
      'chloroplasts capture light energy',
    );
    expect(persisted?.scenes[0].generationContext?.knowledgeVideoReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileId: videoFile.id,
          src: `knowledge://${videoFile.id}`,
        }),
      ]),
    );
  }, 20000);
});
