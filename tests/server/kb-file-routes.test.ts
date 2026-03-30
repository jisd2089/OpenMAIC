import path from 'path';
import { promises as fs } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createGetRequest,
  setupIsolatedWorkspace,
  teardownIsolatedWorkspace,
} from './test-utils';

vi.mock('@/lib/server/video-processing', () => ({
  extractVideoMetadata: vi.fn(async () => ({
    durationMs: 42000,
    width: 1280,
    height: 720,
  })),
  generateVideoPoster: vi.fn(async (_videoPath: string, posterPath: string) => {
    await fs.mkdir(path.dirname(posterPath), { recursive: true });
    await fs.writeFile(posterPath, Buffer.from('poster-image'));
    return true;
  }),
  extractVideoAudio: vi.fn(async () => false),
}));

describe('knowledge file content and poster route integration', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-kb-file-route-test-');
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('serves uploaded knowledge file content and supports range requests', async () => {
    const { getKnowledgeBaseService } = await import('@/lib/server/kb/service');
    const contentRoute = await import('@/app/api/kb/files/[fileId]/content/route');
    const fileContent = 'chloroplast-lesson-content';

    const service = getKnowledgeBaseService();
    const knowledgeBase = await service.createKnowledgeBase({
      scopeId: 'scope-file-route',
      name: 'File Content KB',
      description: 'Route content test',
    });

    const uploaded = await service.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'lesson.txt',
      fileSize: fileContent.length,
      mimeType: 'text/plain',
      autoIngest: true,
      file: new File([fileContent], 'lesson.txt', { type: 'text/plain' }),
    });

    const fullResponse = await contentRoute.GET(
      createGetRequest(`http://localhost/api/kb/files/${uploaded.id}/content`),
      { params: Promise.resolve({ fileId: uploaded.id }) },
    );
    expect(fullResponse.status).toBe(200);
    expect(fullResponse.headers.get('Content-Type')).toContain('text/plain');
    expect(fullResponse.headers.get('Accept-Ranges')).toBe('bytes');
    expect(await fullResponse.text()).toBe(fileContent);

    const rangeRequest = new NextRequest(
      new Request(`http://localhost/api/kb/files/${uploaded.id}/content`, {
        method: 'GET',
        headers: { range: 'bytes=0-10' },
      }),
    );
    const partialResponse = await contentRoute.GET(rangeRequest, {
      params: Promise.resolve({ fileId: uploaded.id }),
    });
    expect(partialResponse.status).toBe(206);
    expect(partialResponse.headers.get('Content-Range')).toBe(`bytes 0-10/${fileContent.length}`);
    expect(await partialResponse.text()).toBe('chloroplast');
  }, 20000);

  it('serves generated knowledge video posters and returns not found when poster is missing', async () => {
    const { getKnowledgeBaseService } = await import('@/lib/server/kb/service');
    const posterRoute = await import('@/app/api/kb/files/[fileId]/poster/route');

    const service = getKnowledgeBaseService();
    const knowledgeBase = await service.createKnowledgeBase({
      scopeId: 'scope-poster-route',
      name: 'Poster KB',
      description: 'Route poster test',
    });

    const withPoster = await service.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'poster-video.mp4',
      fileSize: 16,
      mimeType: 'video/mp4',
      autoIngest: true,
      file: new File([Buffer.from('fake-video')], 'poster-video.mp4', { type: 'video/mp4' }),
    });

    const posterResponse = await posterRoute.GET(
      createGetRequest(`http://localhost/api/kb/files/${withPoster.id}/poster`),
      { params: Promise.resolve({ fileId: withPoster.id }) },
    );
    expect(posterResponse.status).toBe(200);
    expect(posterResponse.headers.get('Content-Type')).toContain('image/jpeg');
    expect(Buffer.from(await posterResponse.arrayBuffer())).toEqual(Buffer.from('poster-image'));

    const withoutPoster = await service.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'no-poster.txt',
      fileSize: 14,
      mimeType: 'text/plain',
      autoIngest: true,
      file: new File(['plain-content'], 'no-poster.txt', { type: 'text/plain' }),
    });

    const missingResponse = await posterRoute.GET(
      createGetRequest(`http://localhost/api/kb/files/${withoutPoster.id}/poster`),
      { params: Promise.resolve({ fileId: withoutPoster.id }) },
    );
    expect(missingResponse.status).toBe(404);
    const missingBody = await missingResponse.json();
    expect(missingBody.errorCode).toBe('KB_FILE_NOT_FOUND');
  }, 20000);
});
