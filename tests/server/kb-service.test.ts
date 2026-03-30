import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/video-processing', () => ({
  extractVideoMetadata: vi.fn(async () => ({
    durationMs: 42000,
    width: 1280,
    height: 720,
  })),
  generateVideoPoster: vi.fn(async () => false),
  extractVideoAudio: vi.fn(async () => false),
}));

const originalCwd = process.cwd();

async function createIsolatedWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openmaic-kb-test-'));
  process.chdir(root);
  return root;
}

describe('knowledge base service integration', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    workspaceRoot = await createIsolatedWorkspace();
  });

  afterEach(async () => {
    const { resetDatabaseClientForTests } = await import('@/lib/server/db/client');
    await resetDatabaseClientForTests();
    process.chdir(originalCwd);
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  it('creates knowledge bases, ingests text files, and searches indexed chunks', async () => {
    const { getKnowledgeBaseService } = await import('@/lib/server/kb/service');
    const service = getKnowledgeBaseService();

    const knowledgeBase = await service.createKnowledgeBase({
      scopeId: 'scope-alpha',
      name: 'Biology Notes',
      description: 'Textbook chunks',
    });

    const upload = await service.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'chapter1.txt',
      fileSize: 64,
      mimeType: 'text/plain',
      autoIngest: true,
      file: new File(
        ['Cells use mitochondria to produce ATP. Photosynthesis occurs in chloroplasts.'],
        'chapter1.txt',
        { type: 'text/plain' },
      ),
    });

    expect(upload.ingestStatus).toBe('indexed');

    const list = await service.listKnowledgeFiles(knowledgeBase.id, {
      page: 1,
      pageSize: 20,
    });
    expect(list.total).toBe(1);
    expect(list.items[0].id).toBe(upload.id);

    const search = await service.searchKnowledgeBase({
      query: 'chloroplasts',
      knowledgeBaseIds: [knowledgeBase.id],
      topK: 5,
      includeVideos: true,
      includeDocuments: true,
    });

    expect(search.items.some((item) => item.type === 'chunk' && item.text.includes('chloroplasts'))).toBe(
      true,
    );
  }, 15000);

  it('reindexes video subtitle sidecars into searchable chunks and preserves metadata', async () => {
    const { getKnowledgeBaseService } = await import('@/lib/server/kb/service');
    const service = getKnowledgeBaseService();

    const knowledgeBase = await service.createKnowledgeBase({
      scopeId: 'scope-video',
      name: 'Video Lessons',
      description: 'Video assets',
    });

    const upload = await service.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'lesson.mp4',
      fileSize: 16,
      mimeType: 'video/mp4',
      autoIngest: true,
      file: new File([Buffer.from('fake-video')], 'lesson.mp4', { type: 'video/mp4' }),
    });

    expect(upload.ingestStatus).toBe('indexed');
    expect(upload.durationMs).toBe(42000);
    expect(upload.width).toBe(1280);
    expect(upload.height).toBe(720);

    const uploadedVideoPath = path.join(
      workspaceRoot,
      'data',
      'uploads',
      'knowledge',
      'scope-video',
      knowledgeBase.slug,
      'files',
      `${upload.id}.mp4`,
    );
    await fs.writeFile(
      path.join(path.dirname(uploadedVideoPath), `${upload.id}.srt`),
      `1
00:00:00,000 --> 00:00:02,000
Mitochondria power the cell.
`,
      'utf-8',
    );

    const reindex = await service.reindexKnowledgeFile(knowledgeBase.id, upload.id);
    expect(reindex.jobId).toMatch(/^ingest_/);

    const search = await service.searchKnowledgeBase({
      query: 'power the cell',
      knowledgeBaseIds: [knowledgeBase.id],
      topK: 5,
      includeVideos: false,
      includeDocuments: true,
    });

    expect(search.items.some((item) => item.type === 'chunk' && item.text.includes('power the cell'))).toBe(
      true,
    );
  }, 15000);
});
