import { describe, expect, it } from 'vitest';
import {
  hasMatchingLoadedStage,
  normalizeLoadedClassroom,
} from '@/lib/classroom/classroom-load';

describe('hasMatchingLoadedStage', () => {
  it('returns true only when the loaded stage matches the target classroom id', () => {
    expect(hasMatchingLoadedStage({ id: 'classroom-a' } as never, 'classroom-a')).toBe(true);
    expect(hasMatchingLoadedStage({ id: 'classroom-b' } as never, 'classroom-a')).toBe(false);
    expect(hasMatchingLoadedStage(null, 'classroom-a')).toBe(false);
  });
});

describe('normalizeLoadedClassroom', () => {
  it('normalizes a persisted classroom payload and fills required defaults', () => {
    const normalized = normalizeLoadedClassroom('course_1', {
      stage: {
        name: '高等数学',
        generationContext: {
          classroomType: 'course',
        },
      },
      scenes: [
        {
          id: 'scene-2',
          type: 'slide',
          title: '第二页',
          order: 2,
          content: {
            type: 'slide',
            canvas: {
              id: 'slide-2',
              elements: [],
            },
          },
        },
        {
          id: 'scene-1',
          type: 'slide',
          title: '第一页',
          order: 1,
          content: {
            type: 'slide',
            canvas: {
              id: 'slide-1',
              elements: [],
            },
          },
        },
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.stage.id).toBe('course_1');
    expect(normalized?.stage.name).toBe('高等数学');
    expect(normalized?.stage.generationContext?.classroomType).toBe('course');
    expect(normalized?.scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2']);
    expect(normalized?.scenes.every((scene) => scene.stageId === 'course_1')).toBe(true);
  });

  it('filters malformed scenes and rejects payloads with no valid scene left', () => {
    const normalized = normalizeLoadedClassroom('course_2', {
      stage: {
        name: '无效课堂',
      },
      scenes: [
        {
          id: 'scene-invalid',
          type: 'slide',
          content: {
            type: 'quiz',
          },
        },
      ],
    });

    expect(normalized).toBeNull();
  });
});
