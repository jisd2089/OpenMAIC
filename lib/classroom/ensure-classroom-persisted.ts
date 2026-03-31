import type { Scene, Stage } from '@/lib/types/stage';
import { createLogger } from '@/lib/logger';

const log = createLogger('EnsureClassroomPersisted');

type FetchLike = typeof fetch;

interface EnsureClassroomPersistedParams {
  classroomId: string;
  stage: Stage | null;
  scenes: Scene[];
  fetchImpl?: FetchLike;
}

interface JsonErrorPayload {
  error?: string;
  message?: string;
  details?: string;
}

async function readJsonSafe(response: Response): Promise<JsonErrorPayload> {
  try {
    return (await response.json()) as JsonErrorPayload;
  } catch {
    return {};
  }
}

function normalizeStageForPersist(classroomId: string, stage: Stage): Stage {
  return {
    ...stage,
    id: classroomId,
  };
}

function normalizeScenesForPersist(classroomId: string, scenes: Scene[]): Scene[] {
  return scenes.map((scene) => ({
    ...scene,
    stageId: classroomId,
  }));
}

export async function ensureClassroomPersisted(params: EnsureClassroomPersistedParams): Promise<{
  mode: 'updated';
}> {
  const fetchImpl = params.fetchImpl ?? fetch;
  if (!params.stage) {
    throw new Error('Classroom stage is not loaded');
  }

  const stage = normalizeStageForPersist(params.classroomId, params.stage);
  const scenes = normalizeScenesForPersist(params.classroomId, params.scenes);

  log.info('Persisting classroom draft before regeneration', {
    classroomId: params.classroomId,
    sceneCount: scenes.length,
  });

  const patchResponse = await fetchImpl(`/api/classroom/${params.classroomId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage,
      scenes,
      saveMode: 'draft',
    }),
  });

  if (patchResponse.ok) {
    log.info('Classroom draft persisted before regeneration', {
      classroomId: params.classroomId,
      status: patchResponse.status,
    });
    return { mode: 'updated' };
  }

  const patchJson = await readJsonSafe(patchResponse);
  log.error('Failed to persist classroom draft before regeneration', {
    classroomId: params.classroomId,
    status: patchResponse.status,
    response: patchJson,
  });
  throw new Error(
    patchJson.details ||
      patchJson.error ||
      patchJson.message ||
      'Failed to save classroom draft',
  );
}
