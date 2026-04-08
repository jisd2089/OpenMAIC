import { describe, expect, it, vi } from 'vitest';
import { mediaFileKey, type AudioFileRecord, type MediaFileRecord } from '@/lib/utils/database';
import { prepareCoursePackageAssets } from '@/lib/classroom/prepare-course-package-assets';
import type { Scene } from '@/lib/types/stage';

function buildMediaRecord(overrides?: Partial<MediaFileRecord>): MediaFileRecord {
  return {
    id: mediaFileKey('cls_1', 'gen_img_1'),
    stageId: 'cls_1',
    type: 'image',
    blob: new Blob(['image-bytes'], { type: 'image/png' }),
    mimeType: 'image/png',
    size: 11,
    prompt: 'diagram',
    params: '{}',
    createdAt: Date.now(),
    ...overrides,
  };
}

function buildAudioRecord(overrides?: Partial<AudioFileRecord>): AudioFileRecord {
  return {
    id: 'tts_speech_1',
    blob: new Blob(['audio-bytes'], { type: 'audio/mpeg' }),
    format: 'mp3',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('prepareCoursePackageAssets', () => {
  it('uploads local generated media, knowledge video assets, and local audio before export', async () => {
    const uploadedRelativePaths: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/kb/files/kfile_video_1/content') {
        return new Response(new Blob(['video-bytes'], { type: 'video/mp4' }), { status: 200 });
      }
      if (url === '/api/kb/files/kfile_video_1/poster') {
        return new Response(new Blob(['poster-bytes'], { type: 'image/jpeg' }), { status: 200 });
      }
      if (url === '/api/classroom/cls_1/assets') {
        const formData = init?.body as FormData;
        uploadedRelativePaths.push(String(formData.get('relativePath')));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const database = {
      mediaFiles: {
        get: vi.fn(async (key: string) => {
          if (key === mediaFileKey('cls_1', 'gen_img_1')) {
            return buildMediaRecord();
          }
          return undefined;
        }),
      },
      audioFiles: {
        get: vi.fn(async (key: string) => {
          if (key === 'tts_speech_1') {
            return buildAudioRecord();
          }
          return undefined;
        }),
      },
    };

    const scenes: Scene[] = [
      {
        id: 'scene_1',
        stageId: 'cls_1',
        type: 'slide',
        title: 'Assets',
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
                id: 'img_1',
                type: 'image',
                left: 0,
                top: 0,
                width: 100,
                height: 100,
                rotate: 0,
                src: 'gen_img_1',
              },
              {
                id: 'video_1',
                type: 'video',
                left: 0,
                top: 120,
                width: 200,
                height: 120,
                rotate: 0,
                autoplay: false,
                src: 'knowledge://kfile_video_1',
              },
            ],
          },
        } as Scene['content'],
        actions: [
          {
            id: 'speech_1',
            type: 'speech',
            text: 'hello world',
            audioId: 'tts_speech_1',
          },
        ] as Scene['actions'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const preparedScenes = await prepareCoursePackageAssets({
      classroomId: 'cls_1',
      scenes,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      database,
    });

    const preparedElements = (
      preparedScenes[0].content as unknown as {
        canvas: { elements: Array<Record<string, unknown>> };
      }
    ).canvas.elements;
    expect(preparedElements[0]?.src).toBe('/api/classroom-media/cls_1/media/gen_img_1.png');
    expect(preparedElements[1]?.src).toBe('/api/classroom-media/cls_1/media/video_1.mp4');
    expect(preparedElements[1]?.poster).toBe('/api/classroom-media/cls_1/media/video_1.poster.jpg');
    expect(preparedScenes[0].actions?.[0]).toMatchObject({
      audioId: 'tts_speech_1',
      audioUrl: '/api/classroom-media/cls_1/audio/tts_speech_1.mp3',
    });

    expect(uploadedRelativePaths).toHaveLength(4);
    expect(uploadedRelativePaths).toEqual(
      expect.arrayContaining([
        'media/gen_img_1.png',
        'media/video_1.mp4',
        'media/video_1.poster.jpg',
        'audio/tts_speech_1.mp3',
      ]),
    );
  });

  it('keeps existing classroom-media references untouched', async () => {
    const fetchImpl = vi.fn();
    const scenes: Scene[] = [
      {
        id: 'scene_1',
        stageId: 'cls_1',
        type: 'slide',
        title: 'Already synced',
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
                id: 'img_1',
                type: 'image',
                left: 0,
                top: 0,
                width: 100,
                height: 100,
                rotate: 0,
                src: '/api/classroom-media/cls_1/media/already.png',
              },
            ],
          },
        } as Scene['content'],
        actions: [
          {
            id: 'speech_1',
            type: 'speech',
            text: 'hello world',
            audioId: 'tts_speech_1',
            audioUrl: '/api/classroom-media/cls_1/audio/tts_speech_1.mp3',
          },
        ] as Scene['actions'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const preparedScenes = await prepareCoursePackageAssets({
      classroomId: 'cls_1',
      scenes,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      database: {
        mediaFiles: { get: vi.fn() },
        audioFiles: { get: vi.fn() },
      },
    });

    expect(preparedScenes).toEqual(scenes);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
