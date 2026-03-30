import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();

async function createIsolatedWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openmaic-memory-test-'));
  process.chdir(root);
  return root;
}

describe('memory service integration', () => {
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

  it('creates, lists, updates, searches, and deletes memory notes with scope isolation', async () => {
    const { getMemoryService } = await import('@/lib/server/memory/service');
    const service = getMemoryService();

    const alpha = await service.createMemoryNote({
      scopeId: 'scope-alpha',
      content: 'Vector retrieval keeps biology facts available for review.',
      category: 'fact',
      keywords: ['biology', 'retrieval'],
      tags: ['lesson'],
      metadata: { lesson: 'biology-1' },
    });
    const beta = await service.createMemoryNote({
      scopeId: 'scope-beta',
      content: 'History timeline note for another workspace.',
      category: 'fact',
      keywords: ['history'],
      tags: ['timeline'],
      metadata: {},
    });

    const alphaList = await service.listMemoryNotes({
      scopeId: 'scope-alpha',
      page: 1,
      pageSize: 20,
    });
    expect(alphaList.total).toBe(1);
    expect(alphaList.items.map((item) => item.id)).toEqual([alpha.id]);

    await service.updateMemoryNote(alpha.id, {
      isPinned: true,
      content: `${alpha.content} Biology review remains pinned.`,
    });

    const searchResults = await service.searchMemory({
      scopeId: 'scope-alpha',
      query: 'biology review',
      categories: [],
      topK: 5,
    });
    expect(searchResults.items).toHaveLength(1);
    expect(searchResults.items[0].id).toBe(alpha.id);
    expect(searchResults.items[0].isPinned).toBe(true);

    const crossScopeResults = await service.searchMemory({
      scopeId: 'scope-beta',
      query: 'biology review',
      categories: [],
      topK: 5,
    });
    expect(crossScopeResults.items).toEqual([]);

    const generated = await service.createMemoryFromStage({
      stageId: 'stage_123',
      content: 'Classroom summary extracted from generated stage.',
      category: 'summary',
      scopeId: 'scope-alpha',
    });
    expect(generated.metadata).toMatchObject({
      source: 'stage',
      stageId: 'stage_123',
    });

    await service.deleteMemoryNote(beta.id);

    await expect(service.getMemoryNote(beta.id)).rejects.toMatchObject({
      code: 'MEMORY_NOT_FOUND',
      status: 404,
    });
  });
});
