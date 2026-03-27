import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupIsolatedWorkspace, teardownIsolatedWorkspace, createFormRequest, createGetRequest, createInvalidJsonRequest, createJsonRequest } from './test-utils';

describe('knowledge base and memory API route integration', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-api-route-test-');
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('handles knowledge base create, list, upload, file list, and search via route handlers', async () => {
    const kbRoute = await import('@/app/api/kb/route');
    const kbFilesRoute = await import('@/app/api/kb/[id]/files/route');
    const kbSearchRoute = await import('@/app/api/kb/search/route');

    const createResponse = await kbRoute.POST(
      createJsonRequest('http://localhost/api/kb', 'POST', {
        scopeId: 'scope-route',
        name: 'Route KB',
        description: 'Created through route test',
      }),
    );
    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();
    expect(createBody.success).toBe(true);
    const kbId = createBody.knowledgeBase.id as string;

    const listResponse = await kbRoute.GET(
      createGetRequest('http://localhost/api/kb?scopeId=scope-route&page=1&pageSize=20'),
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.total).toBe(1);
    expect(listBody.items[0].id).toBe(kbId);

    const formData = new FormData();
    formData.set(
      'file',
      new File(
        ['Route handlers can ingest chloroplast content for biology scenes.'],
        'route-note.txt',
        { type: 'text/plain' },
      ),
    );
    formData.set('autoIngest', 'true');
    const uploadResponse = await kbFilesRoute.POST(
      createFormRequest(`http://localhost/api/kb/${kbId}/files`, 'POST', formData),
      { params: Promise.resolve({ id: kbId }) },
    );
    expect(uploadResponse.status).toBe(201);
    const uploadBody = await uploadResponse.json();
    expect(uploadBody.knowledgeFile.ingestStatus).toBe('indexed');

    const filesResponse = await kbFilesRoute.GET(
      createGetRequest(`http://localhost/api/kb/${kbId}/files?page=1&pageSize=20`),
      { params: Promise.resolve({ id: kbId }) },
    );
    expect(filesResponse.status).toBe(200);
    const filesBody = await filesResponse.json();
    expect(filesBody.total).toBe(1);
    expect(filesBody.items[0].filename).toBe('route-note.txt');

    const searchResponse = await kbSearchRoute.POST(
      createJsonRequest('http://localhost/api/kb/search', 'POST', {
        query: 'chloroplast biology',
        knowledgeBaseIds: [kbId],
        topK: 5,
        includeVideos: true,
        includeDocuments: true,
      }),
    );
    expect(searchResponse.status).toBe(200);
    const searchBody = await searchResponse.json();
    expect(
      searchBody.items.some(
        (item: { type: string; text?: string }) =>
          item.type === 'chunk' && item.text?.includes('chloroplast content'),
      ),
    ).toBe(true);
  }, 20000);

  it('handles memory create, list, detail, update, search, delete, and invalid JSON via route handlers', async () => {
    const memoryRoute = await import('@/app/api/memory/route');
    const memoryDetailRoute = await import('@/app/api/memory/[id]/route');
    const memorySearchRoute = await import('@/app/api/memory/search/route');

    const createResponse = await memoryRoute.POST(
      createJsonRequest('http://localhost/api/memory', 'POST', {
        scopeId: 'scope-route',
        content: 'Teacher reminder about ATP and chloroplast review.',
        category: 'fact',
        keywords: ['ATP'],
        tags: ['biology'],
        metadata: { source: 'route-test' },
      }),
    );
    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();
    const memoryId = createBody.memoryNote.id as string;

    const listResponse = await memoryRoute.GET(
      createGetRequest('http://localhost/api/memory?scopeId=scope-route&page=1&pageSize=20'),
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.total).toBe(1);
    expect(listBody.items[0].id).toBe(memoryId);

    const detailResponse = await memoryDetailRoute.GET(
      createGetRequest(`http://localhost/api/memory/${memoryId}`),
      { params: Promise.resolve({ id: memoryId }) },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.memoryNote.content).toContain('ATP');

    const patchResponse = await memoryDetailRoute.PATCH(
      createJsonRequest(`http://localhost/api/memory/${memoryId}`, 'PATCH', {
        isPinned: true,
        content: 'Pinned ATP reminder for biology lesson.',
      }),
      { params: Promise.resolve({ id: memoryId }) },
    );
    expect(patchResponse.status).toBe(200);
    const patchBody = await patchResponse.json();
    expect(patchBody.memoryNote.isPinned).toBe(true);

    const searchResponse = await memorySearchRoute.POST(
      createJsonRequest('http://localhost/api/memory/search', 'POST', {
        scopeId: 'scope-route',
        query: 'biology lesson',
        categories: [],
        topK: 5,
      }),
    );
    expect(searchResponse.status).toBe(200);
    const searchBody = await searchResponse.json();
    expect(searchBody.items[0].id).toBe(memoryId);

    const invalidPatchResponse = await memoryDetailRoute.PATCH(
      createInvalidJsonRequest(`http://localhost/api/memory/${memoryId}`, 'PATCH', '{invalid-json'),
      { params: Promise.resolve({ id: memoryId }) },
    );
    expect(invalidPatchResponse.status).toBe(400);
    const invalidPatchBody = await invalidPatchResponse.json();
    expect(invalidPatchBody.errorCode).toBe('INVALID_REQUEST');

    const deleteResponse = await memoryDetailRoute.DELETE(
      createGetRequest(`http://localhost/api/memory/${memoryId}`),
      { params: Promise.resolve({ id: memoryId }) },
    );
    expect(deleteResponse.status).toBe(200);
    const deleteBody = await deleteResponse.json();
    expect(deleteBody.id).toBe(memoryId);
  });
});
