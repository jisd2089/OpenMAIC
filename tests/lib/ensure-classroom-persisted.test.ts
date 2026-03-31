import { describe, expect, it, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';
import { ensureClassroomPersisted } from '@/lib/classroom/ensure-classroom-persisted';

function buildStage(id: string): Stage {
  return {
    id,
    name: 'Test Classroom',
    description: 'Draft classroom',
    language: 'zh-CN',
    style: 'default',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildScenes(stageId: string): Scene[] {
  return [
    {
      id: 'scene_1',
      stageId,
      type: 'slide',
      title: 'Scene 1',
      order: 0,
      content: {
        type: 'slide',
        canvas: {
          id: 'slide_scene_1',
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
      },
      actions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

describe('ensureClassroomPersisted', () => {
  it('updates an existing classroom via PATCH', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true }));

    const result = await ensureClassroomPersisted({
      classroomId: 'cls_1',
      stage: buildStage('cls_1'),
      scenes: buildScenes('cls_1'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.mode).toBe('updated');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/classroom/cls_1',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );
  });

  it('saves a local-only classroom via PATCH using the normalized classroom id', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true }));

    const result = await ensureClassroomPersisted({
      classroomId: 'cls_1',
      stage: buildStage('local_only'),
      scenes: buildScenes('local_only'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.mode).toBe('updated');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/classroom/cls_1',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );

    const patchPayload = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string) as {
      stage: Stage;
      scenes: Scene[];
    };
    expect(patchPayload.stage.id).toBe('cls_1');
    expect(patchPayload.scenes[0].stageId).toBe('cls_1');
  });

  it('throws the PATCH error when the save fails for a non-404 reason', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, { error: 'Save failed' }));

    await expect(
      ensureClassroomPersisted({
        classroomId: 'cls_1',
        stage: buildStage('cls_1'),
        scenes: buildScenes('cls_1'),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Save failed');
  });
});
