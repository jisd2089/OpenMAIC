import type { Scene, Stage } from '@/lib/types/stage';
import type { PatchClassroomInput } from '@/lib/server/classroom/contracts';
import type { ClassroomPatchSaveResult } from '@/lib/server/classroom/types';
import { API_ERROR_CODES } from '@/lib/server/api-response';
import { readClassroom, persistClassroom } from '@/lib/server/classroom-storage';
import { ServiceError } from '@/lib/server/service-error';

function mergeScenes(
  classroomId: string,
  existingScenes: Scene[],
  scenePatches: PatchClassroomInput['scenes'],
): Scene[] {
  const now = Date.now();
  const patchById = new Map(scenePatches.map((scene) => [scene.id, scene]));

  const merged: Scene[] = existingScenes.map((scene) => {
    const patch = patchById.get(scene.id);
    if (!patch) {
      return scene;
    }
    patchById.delete(scene.id);
    return {
      ...scene,
      ...patch,
      content: (patch.content as Scene['content']) ?? scene.content,
      actions: (patch.actions as Scene['actions']) ?? scene.actions,
      whiteboards: (patch.whiteboards as Scene['whiteboards']) ?? scene.whiteboards,
      generationContext: (patch.generationContext as Scene['generationContext']) ?? scene.generationContext,
      id: scene.id,
      stageId: classroomId,
      draftSource: patch.draftSource || 'manual',
      lastManualEditedAt: patch.lastManualEditedAt || new Date().toISOString(),
      updatedAt: now,
    };
  });

  for (const patch of patchById.values()) {
    merged.push({
      id: patch.id,
      stageId: classroomId,
      type: patch.type || 'slide',
      title: patch.title || 'Untitled Scene',
      order: patch.order ?? merged.length,
      content:
        (patch.content as Scene['content']) || {
          type: 'slide',
          canvas: {
            id: `slide_${patch.id}`,
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
      actions: patch.actions as Scene['actions'],
      whiteboards: patch.whiteboards as Scene['whiteboards'],
      generationContext: patch.generationContext as Scene['generationContext'],
      locked: patch.locked,
      draftSource: patch.draftSource || 'manual',
      lastManualEditedAt: patch.lastManualEditedAt || new Date().toISOString(),
      createdAt: patch.createdAt || now,
      updatedAt: patch.updatedAt || now,
    });
  }

  return merged
    .sort((a, b) => a.order - b.order)
    .map((scene, index) => ({
      ...scene,
      order: index,
    }));
}

export async function patchClassroom(params: {
  classroomId: string;
  input: PatchClassroomInput;
  baseUrl: string;
}): Promise<{ classroom: { stage: Stage; scenes: Scene[] }; result: ClassroomPatchSaveResult }> {
  const existing = await readClassroom(params.classroomId);
  if (!existing) {
    throw new ServiceError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
  }

  const now = Date.now();
  const editedAt = new Date().toISOString();
  const stage: Stage = {
    ...existing.stage,
    ...(params.input.stage as Partial<Stage> | undefined),
    id: params.classroomId,
    updatedAt: now,
    editable: true,
    isDraft: params.input.saveMode !== 'publish',
    lastManualEditedAt: editedAt,
  };
  const scenes = mergeScenes(params.classroomId, existing.scenes, params.input.scenes || []);

  await persistClassroom(
    {
      id: params.classroomId,
      stage,
      scenes,
    },
    params.baseUrl,
    { createdAt: existing.createdAt },
  );

  return {
    classroom: { stage, scenes },
    result: {
      classroomId: params.classroomId,
      savedAt: editedAt,
      saveMode: params.input.saveMode,
    },
  };
}
