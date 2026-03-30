import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupIsolatedWorkspace, teardownIsolatedWorkspace, createJsonRequest } from './test-utils';

const buildPromptMock = vi.hoisted(() =>
  vi.fn(() => ({
    system: 'system prompt',
    user: 'user prompt',
  })),
);

const streamLLMMock = vi.hoisted(() =>
  vi.fn(() => ({
    textStream: (async function* () {
      yield JSON.stringify([
        {
          id: 'outline_1',
          type: 'slide',
          title: 'Energy Flow',
          description: 'Explain chloroplast energy transfer.',
          keyPoints: ['chloroplast', 'ATP'],
          order: 1,
          language: 'en-US',
        },
      ]);
    })(),
  })),
);

vi.mock('@/lib/generation/prompts', () => ({
  buildPrompt: buildPromptMock,
  PROMPT_IDS: {
    REQUIREMENTS_TO_OUTLINES: 'REQUIREMENTS_TO_OUTLINES',
  },
}));

vi.mock('@/lib/ai/llm', () => ({
  streamLLM: streamLLMMock,
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

describe('scene-outlines-stream retrieval injection', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    buildPromptMock.mockClear();
    streamLLMMock.mockClear();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-outline-stream-test-');
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('injects knowledge base and memory retrieval context into outline prompt generation', async () => {
    const { getKnowledgeBaseService } = await import('@/lib/server/kb/service');
    const { getMemoryService } = await import('@/lib/server/memory/service');
    const outlinesRoute = await import('@/app/api/generate/scene-outlines-stream/route');

    const kbService = getKnowledgeBaseService();
    const memoryService = getMemoryService();

    const knowledgeBase = await kbService.createKnowledgeBase({
      scopeId: 'scope-outline',
      name: 'Outline Retrieval KB',
      description: 'Used for outline retrieval test',
    });

    await kbService.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'outline-notes.txt',
      fileSize: 64,
      mimeType: 'text/plain',
      autoIngest: true,
      file: new File(
        ['Chloroplasts capture light energy before ATP-related transfer begins.'],
        'outline-notes.txt',
        { type: 'text/plain' },
      ),
    });

    await memoryService.createMemoryNote({
      scopeId: 'scope-outline',
      content: 'Memory note: mention ATP when outlining chloroplast lessons.',
      category: 'fact',
      keywords: ['ATP'],
      tags: ['biology'],
      metadata: {},
    });

    const response = await outlinesRoute.POST(
      createJsonRequest('http://localhost/api/generate/scene-outlines-stream', 'POST', {
        requirements: {
          requirement: 'Create a lesson about chloroplast energy flow',
          language: 'en-US',
        },
        scopeId: 'scope-outline',
        knowledgeBaseIds: [knowledgeBase.id],
        enableKnowledgeRetrieval: true,
        enableMemoryRetrieval: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');

    const sseText = await response.text();
    expect(sseText).toContain('"type":"outline"');
    expect(sseText).toContain('"type":"done"');
    expect(sseText).toContain('Energy Flow');

    expect(buildPromptMock).toHaveBeenCalledTimes(1);
    const promptCall = buildPromptMock.mock.calls[0] as unknown[];
    const promptArgs = promptCall[1] as Record<string, string>;
    expect(promptArgs.researchContext).toContain('Knowledge Text');
    expect(promptArgs.researchContext).toContain('Memory:fact');
    expect(promptArgs.researchContext.toLowerCase()).toContain('chloroplasts capture light energy');
  }, 20000);
});
