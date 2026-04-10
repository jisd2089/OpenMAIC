import { describe, expect, it } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';
import { serializeClassroomForDify } from '@/lib/server/publish/classroom-dify-serializer';

function buildStage(): Stage {
  return {
    id: 'cls_dify',
    name: 'C语言数据结构',
    language: 'zh-CN',
    style: 'professional',
    generationContext: {
      classroomType: 'knowledge',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildSlideScene(text: string): Scene {
  return {
    id: 'scene_1',
    stageId: 'cls_dify',
    type: 'slide',
    title: '顺序表',
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
            id: 'text_1',
            type: 'text',
            content: text,
          } as never,
        ],
      },
    },
    actions: [
      {
        id: 'speech_1',
        type: 'speech',
        text: '这一页讲解顺序表的定义与基本特征。',
      },
    ],
  };
}

describe('serializeClassroomForDify', () => {
  it('serializes metadata and page content into bounded segments', () => {
    const longText = '数组存储，逻辑连续。'.repeat(400);
    const result = serializeClassroomForDify({
      classroomId: 'gJsjGFbKau',
      stage: buildStage(),
      scenes: [buildSlideScene(longText)],
    });

    expect(result.metadata).toEqual({
      classroom: 'gJsjGFbKau',
      type: 'knowledge',
      title: 'C语言数据结构',
    });
    expect(result.contentHash).toHaveLength(64);
    expect(result.segments.length).toBeGreaterThan(1);
    expect(result.documentText).toContain('classroom: gJsjGFbKau');
    expect(result.documentText).toContain('type: knowledge');
    expect(result.documentText).toContain('title: C语言数据结构');
    expect(result.documentText).toContain('Narration');
    expect(result.documentText).toContain('Segment: Page 1 / Part 2');
    for (const segment of result.segments) {
      expect(segment.text.length).toBeLessThanOrEqual(4000);
    }
  });
});
