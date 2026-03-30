import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonRequest, setupIsolatedWorkspace, teardownIsolatedWorkspace } from './test-utils';

const generateSceneContentMock = vi.hoisted(() =>
  vi.fn(async () => ({
    type: 'slide',
    canvas: {
      id: 'slide_test',
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
);

vi.mock('@/lib/generation/generation-pipeline', () => ({
  applyOutlineFallbacks: vi.fn((outline) => outline),
  buildVisionUserContent: vi.fn(() => []),
  generateSceneContent: generateSceneContentMock,
}));

vi.mock('@/lib/ai/llm', () => ({
  callLLM: vi.fn(async () => ({ text: 'unused' })),
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromHeaders: vi.fn(() => ({
    model: {},
    modelInfo: {
      capabilities: {
        vision: false,
      },
      outputWindow: 4096,
    },
    modelString: 'test-model',
  })),
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

describe('generation retrieval context injection', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    generateSceneContentMock.mockClear();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-generation-retrieval-test-');
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('injects knowledge base text, selected memory, and knowledge video references into scene generation', async () => {
    const { getKnowledgeBaseService } = await import('@/lib/server/kb/service');
    const { getMemoryService } = await import('@/lib/server/memory/service');
    const sceneContentRoute = await import('@/app/api/generate/scene-content/route');

    const kbService = getKnowledgeBaseService();
    const memoryService = getMemoryService();

    const knowledgeBase = await kbService.createKnowledgeBase({
      scopeId: 'scope-generation',
      name: 'Biology Retrieval',
      description: 'Knowledge retrieval test data',
    });

    await kbService.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'chloroplast-notes.txt',
      fileSize: 64,
      mimeType: 'text/plain',
      autoIngest: true,
      file: new File(
        ['Chloroplasts convert light into chemical energy for plants.'],
        'chloroplast-notes.txt',
        { type: 'text/plain' },
      ),
    });

    const videoFile = await kbService.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'chloroplast-demo.mp4',
      fileSize: 16,
      mimeType: 'video/mp4',
      autoIngest: true,
      file: new File([Buffer.from('fake-video')], 'chloroplast-demo.mp4', { type: 'video/mp4' }),
    });

    const memoryNote = await memoryService.createMemoryNote({
      scopeId: 'scope-generation',
      content: 'Memory note: emphasize ATP production when explaining chloroplasts.',
      category: 'fact',
      keywords: ['ATP'],
      tags: ['biology'],
      metadata: {},
    });

    const response = await sceneContentRoute.POST(
      createJsonRequest('http://localhost/api/generate/scene-content', 'POST', {
        outline: {
          id: 'outline_1',
          type: 'slide',
          title: 'Chloroplast Energy Flow',
          description: 'Explain how chloroplasts support plant energy conversion.',
          keyPoints: ['chloroplast', 'ATP'],
          order: 1,
          language: 'en-US',
        },
        allOutlines: [
          {
            id: 'outline_1',
            type: 'slide',
            title: 'Chloroplast Energy Flow',
            description: 'Explain how chloroplasts support plant energy conversion.',
            keyPoints: ['chloroplast', 'ATP'],
            order: 1,
            language: 'en-US',
          },
        ],
        stageInfo: {
          name: 'Biology Stage',
          description: 'Retrieval injection route test',
          language: 'en-US',
          style: 'educational',
        },
        stageId: 'stage_generation',
        scopeId: 'scope-generation',
        knowledgeBaseIds: [knowledgeBase.id],
        memoryIds: [memoryNote.id],
        enableKnowledgeRetrieval: true,
        enableMemoryRetrieval: true,
        preferKnowledgeVideos: true,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.retrievalContext).toContain('Knowledge Text');
    expect(body.retrievalContext).toContain('Memory:fact');
    expect(String(body.retrievalContext).toLowerCase()).toContain('chloroplasts convert light');
    expect(body.knowledgeVideoReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileId: videoFile.id,
          filename: 'chloroplast-demo.mp4',
          src: `knowledge://${videoFile.id}`,
        }),
      ]),
    );

    expect(generateSceneContentMock).toHaveBeenCalledTimes(1);
    const call = generateSceneContentMock.mock.calls[0] as unknown[];
    expect(call[8]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileId: videoFile.id,
          src: `knowledge://${videoFile.id}`,
        }),
      ]),
    );
    expect(call[9]).toContain('Knowledge Text');
    expect(call[9]).toContain('Memory:fact');
  }, 20000);
});
