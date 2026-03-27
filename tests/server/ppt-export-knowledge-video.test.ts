import path from 'path';
import { promises as fs } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupIsolatedWorkspace, teardownIsolatedWorkspace } from './test-utils';
import type { Scene, Stage } from '@/lib/types/stage';
import type { Slide } from '@/lib/types/slides';

const pptxState = vi.hoisted(() => {
  let lastInstance: {
    slides: Array<{
      media: Array<Record<string, unknown>>;
      notes: string[];
    }>;
  } | null = null;

  class MockSlide {
    media: Array<Record<string, unknown>> = [];
    notes: string[] = [];
    addNotes(note: string) {
      this.notes.push(note);
    }
    addText() {}
    addImage() {}
    addShape() {}
    addChart() {}
    addTable() {}
    addFormula() {}
    addMedia(options: Record<string, unknown>) {
      this.media.push(options);
    }
  }

  class MockPptx {
    author = '';
    company = '';
    title = '';
    subject = '';
    layout = '';
    slides: MockSlide[] = [];
    addSlide() {
      const slide = new MockSlide();
      this.slides.push(slide);
      return slide;
    }
    async write() {
      lastInstance = {
        slides: this.slides.map((slide) => ({
          media: slide.media,
          notes: slide.notes,
        })),
      };
      return new Blob(['pptx'], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
    }
  }

  return {
    MockPptx,
    getLastInstance: () => lastInstance,
  };
});

vi.mock('pptxgenjs', () => ({
  default: pptxState.MockPptx,
}));

vi.mock('@/lib/store/media-generation', () => ({
  isMediaPlaceholder: vi.fn(() => false),
  useMediaGenerationStore: {
    getState: () => ({
      tasks: {},
    }),
  },
}));

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

describe('ppt export knowledge video integration', () => {
  let workspaceRoot: string;
  let originalFetch: typeof global.fetch | undefined;
  let originalFileReader: typeof global.FileReader | undefined;

  beforeEach(async () => {
    vi.resetModules();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-ppt-export-test-');
    originalFetch = global.fetch;
    originalFileReader = global.FileReader;

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/content')) {
        return new Response(new Blob([Buffer.from('video-binary')], { type: 'video/mp4' }), {
          status: 200,
        });
      }
      if (url.endsWith('/poster')) {
        return new Response(new Blob([Buffer.from('poster-binary')], { type: 'image/png' }), {
          status: 200,
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof global.fetch;

    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onloadend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(blob: Blob) {
        blob
          .arrayBuffer()
          .then((buffer) => {
            const base64 = Buffer.from(buffer).toString('base64');
            this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
            this.onloadend?.();
          })
          .catch(() => this.onerror?.());
      }
    }

    global.FileReader = MockFileReader as typeof FileReader;
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
    global.fetch = originalFetch as typeof global.fetch;
    global.FileReader = originalFileReader as typeof global.FileReader;
  });

  it('resolves knowledge:// video sources and posters before embedding PPT media', async () => {
    const { buildPptxBlob } = await import('@/lib/export/use-export-pptx');

    const stage: Stage = {
      id: 'stage_ppt',
      name: 'Knowledge Video Stage',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const slide: Slide = {
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
          id: 'video_1',
          type: 'video',
          left: 40,
          top: 60,
          width: 320,
          height: 180,
          rotate: 0,
          autoplay: false,
          src: 'knowledge://kfile_video_1',
        },
      ],
    };

    const scene: Scene = {
      id: 'scene_1',
      stageId: 'stage_ppt',
      type: 'slide',
      title: 'Knowledge Video Scene',
      order: 1,
      content: {
        type: 'slide',
        canvas: slide,
      },
    };

    const blob = await buildPptxBlob(stage, [slide], [scene], 0.5625, 1000, 100, 1.3333333333);
    expect(blob).toBeInstanceOf(Blob);

    expect(global.fetch).toHaveBeenCalledWith('/api/kb/files/kfile_video_1/content');
    expect(global.fetch).toHaveBeenCalledWith('/api/kb/files/kfile_video_1/poster');

    const lastInstance = pptxState.getLastInstance();
    expect(lastInstance).not.toBeNull();
    expect(lastInstance?.slides).toHaveLength(1);
    expect(lastInstance?.slides[0].media).toHaveLength(1);
    expect(lastInstance?.slides[0].media[0]).toMatchObject({
      type: 'video',
      extn: 'mp4',
    });
    expect(String(lastInstance?.slides[0].media[0].data)).toContain('data:video/mp4;base64,');
    expect(String(lastInstance?.slides[0].media[0].cover)).toContain('data:image/png;base64,');
  }, 20000);

  it('fetches knowledge video content and poster through real kb routes before embedding PPT media', async () => {
    const { getKnowledgeBaseService } = await import('@/lib/server/kb/service');
    const contentRoute = await import('@/app/api/kb/files/[fileId]/content/route');
    const posterRoute = await import('@/app/api/kb/files/[fileId]/poster/route');
    const { buildPptxBlob } = await import('@/lib/export/use-export-pptx');

    const service = getKnowledgeBaseService();
    const knowledgeBase = await service.createKnowledgeBase({
      scopeId: 'scope-ppt-kb-video',
      name: 'PPT KB Video',
      description: 'Real route fetch for ppt export',
    });

    const uploadedVideo = await service.uploadKnowledgeFile({
      knowledgeBaseId: knowledgeBase.id,
      fileName: 'lesson-video.mp4',
      fileSize: 17,
      mimeType: 'video/mp4',
      autoIngest: true,
      file: new File([Buffer.from('real-video-binary')], 'lesson-video.mp4', { type: 'video/mp4' }),
    });

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      const match = url.pathname.match(/^\/api\/kb\/files\/([^/]+)\/(content|poster)$/);
      if (!match) {
        return new Response(null, { status: 404 });
      }

      const [, fileId, kind] = match;
      if (kind === 'content') {
        return contentRoute.GET(new Request(url.toString()) as never, {
          params: Promise.resolve({ fileId }),
        });
      }

      return posterRoute.GET(new Request(url.toString()) as never, {
        params: Promise.resolve({ fileId }),
      });
    }) as typeof global.fetch;

    const stage: Stage = {
      id: 'stage_ppt_real_kb',
      name: 'Knowledge Video Stage',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const slide: Slide = {
      id: 'slide_real_kb_1',
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
          id: 'video_real_kb_1',
          type: 'video',
          left: 40,
          top: 60,
          width: 320,
          height: 180,
          rotate: 0,
          autoplay: false,
          src: `knowledge://${uploadedVideo.id}`,
        },
      ],
    };

    const scene: Scene = {
      id: 'scene_real_kb_1',
      stageId: stage.id,
      type: 'slide',
      title: 'Knowledge Video Scene',
      order: 1,
      content: {
        type: 'slide',
        canvas: slide,
      },
    };

    const blob = await buildPptxBlob(stage, [slide], [scene], 0.5625, 1000, 100, 1.3333333333);
    expect(blob).toBeInstanceOf(Blob);

    expect(global.fetch).toHaveBeenCalledWith(`/api/kb/files/${uploadedVideo.id}/content`);
    expect(global.fetch).toHaveBeenCalledWith(`/api/kb/files/${uploadedVideo.id}/poster`);

    const lastInstance = pptxState.getLastInstance();
    expect(lastInstance?.slides).toHaveLength(1);
    expect(lastInstance?.slides[0].media).toHaveLength(1);
    expect(lastInstance?.slides[0].media[0]).toMatchObject({
      type: 'video',
      extn: 'mp4',
    });
    expect(String(lastInstance?.slides[0].media[0].data)).toContain(
      `data:video/mp4;base64,${Buffer.from('real-video-binary').toString('base64')}`,
    );
    expect(String(lastInstance?.slides[0].media[0].cover)).toContain(
      `data:image/jpeg;base64,${Buffer.from('poster-image').toString('base64')}`,
    );
  }, 20000);
});
