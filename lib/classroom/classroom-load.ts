import type { Scene, Stage } from '@/lib/types/stage';

type ClassroomSceneType = Scene['type'];

const VALID_SCENE_TYPES: ClassroomSceneType[] = ['slide', 'quiz', 'interactive', 'pbl'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function isValidSceneType(value: unknown): value is ClassroomSceneType {
  return typeof value === 'string' && VALID_SCENE_TYPES.includes(value as ClassroomSceneType);
}

function normalizeScene(
  classroomId: string,
  rawScene: unknown,
  index: number,
  now: number,
): Scene | null {
  if (!isPlainObject(rawScene)) return null;

  const id = asString(rawScene.id);
  const type = rawScene.type;
  const title = asString(rawScene.title);
  const content = rawScene.content;

  if (!id || !isValidSceneType(type) || !isPlainObject(content) || content.type !== type) {
    return null;
  }

  return {
    id,
    stageId: classroomId,
    type,
    title: title || `Untitled Scene ${index + 1}`,
    order: asNumber(rawScene.order) ?? index,
    content: content as unknown as Scene['content'],
    actions: Array.isArray(rawScene.actions) ? (rawScene.actions as Scene['actions']) : undefined,
    whiteboards: Array.isArray(rawScene.whiteboards)
      ? (rawScene.whiteboards as Scene['whiteboards'])
      : undefined,
    multiAgent: isPlainObject(rawScene.multiAgent)
      ? (rawScene.multiAgent as Scene['multiAgent'])
      : undefined,
    generationContext: isPlainObject(rawScene.generationContext)
      ? (rawScene.generationContext as Scene['generationContext'])
      : undefined,
    locked: typeof rawScene.locked === 'boolean' ? rawScene.locked : undefined,
    draftSource: rawScene.draftSource === 'manual' || rawScene.draftSource === 'regenerate'
      ? rawScene.draftSource
      : undefined,
    lastManualEditedAt: asString(rawScene.lastManualEditedAt),
    lastRegeneratedAt: asString(rawScene.lastRegeneratedAt),
    createdAt: asNumber(rawScene.createdAt) ?? now,
    updatedAt: asNumber(rawScene.updatedAt) ?? now,
  };
}

export function hasMatchingLoadedStage(stage: Stage | null | undefined, classroomId: string) {
  return Boolean(stage?.id && stage.id === classroomId);
}

export function normalizeLoadedClassroom(
  classroomId: string,
  rawClassroom: unknown,
): { stage: Stage; scenes: Scene[] } | null {
  if (!isPlainObject(rawClassroom) || !isPlainObject(rawClassroom.stage) || !Array.isArray(rawClassroom.scenes)) {
    return null;
  }

  const now = Date.now();
  const rawStage = rawClassroom.stage;
  const scenes = rawClassroom.scenes
    .map((scene, index) => normalizeScene(classroomId, scene, index, now))
    .filter((scene): scene is Scene => scene !== null)
    .sort((a, b) => a.order - b.order);

  if (scenes.length === 0) {
    return null;
  }

  const stage: Stage = {
    id: classroomId,
    name: asString(rawStage.name) || classroomId,
    description: asString(rawStage.description),
    createdAt: asNumber(rawStage.createdAt) ?? now,
    updatedAt: asNumber(rawStage.updatedAt) ?? now,
    language: asString(rawStage.language),
    style: asString(rawStage.style),
    generationContext: isPlainObject(rawStage.generationContext)
      ? (rawStage.generationContext as Stage['generationContext'])
      : undefined,
    whiteboard: Array.isArray(rawStage.whiteboard)
      ? (rawStage.whiteboard as Stage['whiteboard'])
      : undefined,
    agentIds: asStringArray(rawStage.agentIds),
    generatedAgents: Array.isArray(rawStage.generatedAgents)
      ? (rawStage.generatedAgents as Stage['generatedAgents'])
      : undefined,
    editable: typeof rawStage.editable === 'boolean' ? rawStage.editable : undefined,
    isDraft: typeof rawStage.isDraft === 'boolean' ? rawStage.isDraft : undefined,
    revisionId: asString(rawStage.revisionId),
    lastManualEditedAt: asString(rawStage.lastManualEditedAt),
    lastRegeneratedAt: asString(rawStage.lastRegeneratedAt),
  };

  return { stage, scenes };
}
