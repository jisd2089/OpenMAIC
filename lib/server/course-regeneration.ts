import { callLLM } from '@/lib/ai/llm';
import { createStageAPI } from '@/lib/api/stage-api';
import type { StageStore } from '@/lib/api/stage-api-types';
import { createLogger } from '@/lib/logger';
import { parseModelString } from '@/lib/ai/providers';
import type { MediaGenerationRequest } from '@/lib/media/types';
import { resolveApiKey } from '@/lib/server/provider-config';
import { resolveModel } from '@/lib/server/resolve-model';
import {
  buildGenerationRetrievalContext,
  getKnowledgeVideoReferencesForGeneration,
} from '@/lib/server/generation-retrieval';
import {
  createSceneWithActions,
  generateSceneActions,
  generateSceneContent,
} from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { SceneOutline } from '@/lib/types/generation';
import type { Action } from '@/lib/types/action';
import type { Scene, Stage } from '@/lib/types/stage';
import type { CreateClassroomRegenerationJobInput } from '@/lib/server/classroom/contracts';
import { API_ERROR_CODES } from '@/lib/server/api-response';
import { ServiceError } from '@/lib/server/service-error';
import { readClassroom, persistClassroom } from '@/lib/server/classroom-storage';
import { createClassroomRevision } from '@/lib/server/classroom-revision-store';
import {
  generateMediaForClassroom,
  generateTTSForClassroom,
  replaceMediaPlaceholders,
} from '@/lib/server/classroom-media-generation';
import {
  readClassroomRegenerationJob,
  updateClassroomRegenerationJob,
  type ClassroomRegenerationJob,
} from '@/lib/server/classroom-regeneration-store';

const log = createLogger('ClassroomRegeneration');

function createInMemoryStore(stage: Stage): StageStore {
  let state = {
    stage: stage as Stage | null,
    scenes: [] as Scene[],
    currentSceneId: null as string | null,
    mode: 'playback' as const,
  };

  const listeners: Array<(s: typeof state, prev: typeof state) => void> = [];

  return {
    getState: () => state,
    setState: (partial: Partial<typeof state>) => {
      const prev = state;
      state = { ...state, ...partial };
      listeners.forEach((fn) => fn(state, prev));
    },
    subscribe: (listener: (s: typeof state, prev: typeof state) => void) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function summarizeScene(scene: Scene): string {
  if (scene.type === 'slide' && scene.content.type === 'slide') {
    const text = scene.content.canvas.elements
      .filter((element) => element.type === 'text' && 'content' in element)
      .map((element) => stripHtml(String(element.content || '')))
      .filter(Boolean)
      .join(' ');
    return text.slice(0, 500) || scene.title;
  }
  if (scene.type === 'quiz' && scene.content.type === 'quiz') {
    return scene.content.questions.map((question) => question.question).join(' ').slice(0, 500);
  }
  if (scene.type === 'interactive' && scene.content.type === 'interactive') {
    return stripHtml(scene.content.html || scene.content.url || scene.title).slice(0, 500);
  }
  if (scene.type === 'pbl' && scene.content.type === 'pbl') {
    const projectInfo = scene.content.projectConfig.projectInfo;
    return `${projectInfo.title} ${projectInfo.description}`.slice(0, 500);
  }
  return scene.title;
}

function buildRegenerationOutline(
  stage: Stage,
  scene: Scene,
  prompt: string,
  regenerateMode: CreateClassroomRegenerationJobInput['regenerateMode'],
): SceneOutline {
  const sceneSummary = summarizeScene(scene);
  return {
    id: scene.id,
    type: scene.type,
    title: scene.title,
    order: scene.order,
    language: stage.language === 'en-US' ? 'en-US' : 'zh-CN',
    description:
      `Rework the existing scene based on the user request. ` +
      `Mode: ${regenerateMode}. Existing scene summary: ${sceneSummary}. ` +
      `User request: ${prompt}`,
    keyPoints: [scene.title, sceneSummary, prompt].filter(Boolean).slice(0, 5),
    teachingObjective: scene.title,
  };
}

function resolveTargetSceneIds(classroom: { scenes: Scene[] }, job: ClassroomRegenerationJob): string[] {
  if (job.targetType === 'classroom') {
    return classroom.scenes.map((scene) => scene.id);
  }
  if (job.targetType === 'scene') {
    return job.targetId ? [job.targetId] : [];
  }
  return job.targetId
    ? job.targetId
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : job.targetSceneIds;
}

function createServerAiCall(): AICallFn {
  const { model: languageModel, modelInfo, modelString } = resolveModel({});
  const { providerId } = parseModelString(modelString);
  log.info(`Using server-configured regeneration model: ${modelString}`);
  const apiKey = resolveApiKey(providerId);
  if (!apiKey) {
    throw new Error(
      `No API key configured for provider "${providerId}". Set the appropriate API key before regeneration.`,
    );
  }

  return async (systemPrompt, userPrompt) => {
    const result = await callLLM(
      {
        model: languageModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'classroom-regenerate',
    );
    return result.text;
  };
}

function pickAspectRatio(width: number, height: number): '16:9' | '4:3' | '1:1' | '9:16' {
  if (!width || !height) {
    return '16:9';
  }
  const ratio = width / height;
  if (ratio < 0.9) return '9:16';
  if (ratio < 1.2) return '1:1';
  if (ratio < 1.55) return '4:3';
  return '16:9';
}

function buildRegenerationMediaRequests(scene: Scene, prompt: string): MediaGenerationRequest[] {
  if (scene.type !== 'slide' || scene.content.type !== 'slide') {
    return [];
  }

  const mediaElements = scene.content.canvas.elements.filter(
    (element) => element.type === 'image' || element.type === 'video',
  );
  let imageIndex = 0;
  let videoIndex = 0;

  return mediaElements.map((element) => {
    const isVideo = element.type === 'video';
    if (isVideo) {
      videoIndex += 1;
    } else {
      imageIndex += 1;
    }

    return {
      type: isVideo ? 'video' : 'image',
      elementId: isVideo
        ? `gen_vid_${scene.id}_${videoIndex}`
        : `gen_img_${scene.id}_${imageIndex}`,
      prompt: isVideo
        ? `Create a short instructional video for the slide "${scene.title}" that matches this rework request: ${prompt}`
        : `Create a polished teaching visual for the slide "${scene.title}" that matches this rework request: ${prompt}`,
      aspectRatio: pickAspectRatio(element.width, element.height),
    } satisfies MediaGenerationRequest;
  });
}

function buildRegenerationMediaOutlines(params: {
  originalScenes: Scene[];
  previewScenes: Scene[];
  prompt: string;
  language?: Stage['language'];
}): SceneOutline[] {
  const originalById = new Map(params.originalScenes.map((scene) => [scene.id, scene]));

  return params.previewScenes.reduce<SceneOutline[]>((outlines, previewScene) => {
      const originalScene = originalById.get(previewScene.id);
      if (!originalScene) {
        return outlines;
      }

      const mediaGenerations = buildRegenerationMediaRequests(originalScene, params.prompt);
      if (mediaGenerations.length === 0) {
        return outlines;
      }

      outlines.push({
        id: previewScene.id,
        type: previewScene.type,
        title: previewScene.title,
        description: `Regenerated media for ${previewScene.title}`,
        keyPoints: [params.prompt],
        order: previewScene.order,
        language: params.language === 'en-US' ? 'en-US' : 'zh-CN',
        mediaGenerations,
      } satisfies SceneOutline);

      return outlines;
    }, []);
}

async function regenerateScenePreview(params: {
  stage: Stage;
  scene: Scene;
  prompt: string;
  regenerateMode: CreateClassroomRegenerationJobInput['regenerateMode'];
  scopeId?: string;
  knowledgeBaseIds: string[];
  memoryIds: string[];
  aiCall: AICallFn;
}): Promise<Scene> {
  const outline = buildRegenerationOutline(
    params.stage,
    params.scene,
    params.prompt,
    params.regenerateMode,
  );
  const query = [params.stage.name, params.scene.title, summarizeScene(params.scene), params.prompt]
    .filter(Boolean)
    .join('\n');

  const retrievalContext = await buildGenerationRetrievalContext({
    query,
    scopeId: params.scopeId,
    knowledgeBaseIds: params.knowledgeBaseIds,
    memoryIds: params.memoryIds,
    enableKnowledgeRetrieval: params.knowledgeBaseIds.length > 0,
    enableMemoryRetrieval: params.memoryIds.length > 0,
    preferKnowledgeVideos: true,
  });
  const knowledgeVideoReferences = await getKnowledgeVideoReferencesForGeneration({
    query,
    knowledgeBaseIds: params.knowledgeBaseIds,
    preferKnowledgeVideos: true,
  });

  const content = await generateSceneContent(
    outline,
    params.aiCall,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    knowledgeVideoReferences,
    retrievalContext,
  );
  if (!content) {
    throw new Error(`Failed to generate regenerated content for scene ${params.scene.id}`);
  }

  const actions = await generateSceneActions(outline, content, params.aiCall);
  const store = createInMemoryStore(params.stage);
  const api = createStageAPI(store);
  const sceneId = createSceneWithActions(outline, content, actions as Action[], api);
  if (!sceneId) {
    throw new Error(`Failed to create preview scene for ${params.scene.id}`);
  }
  const generated = store.getState().scenes[0];
  if (!generated) {
    throw new Error(`Generated preview scene missing for ${params.scene.id}`);
  }

  const now = Date.now();
  return {
    ...generated,
    id: params.scene.id,
    stageId: params.scene.stageId,
    order: params.scene.order,
    title: params.scene.title,
    locked: params.scene.locked,
    draftSource: 'regenerate',
    lastRegeneratedAt: new Date().toISOString(),
    generationContext: {
      retrievalContext,
      knowledgeVideoReferences,
    },
    createdAt: params.scene.createdAt || now,
    updatedAt: now,
  };
}

export async function runClassroomRegeneration(jobId: string): Promise<void> {
  await updateClassroomRegenerationJob(jobId, {
    status: 'running',
    step: 'preparing',
    message: 'Preparing regeneration job',
  });

  const job = await readClassroomRegenerationJob(jobId);
  if (!job) {
    throw new ServiceError(
      API_ERROR_CODES.REGENERATION_JOB_NOT_FOUND,
      404,
      'Regeneration job not found',
    );
  }

  const classroom = await readClassroom(job.classroomId);
  if (!classroom) {
    throw new ServiceError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
  }

  const targetSceneIds = resolveTargetSceneIds(classroom, job);
  const targetScenes = classroom.scenes.filter((scene) => targetSceneIds.includes(scene.id));
  if (targetScenes.length === 0) {
    throw new ServiceError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'No target scenes found for regeneration',
    );
  }

  await updateClassroomRegenerationJob(jobId, {
    status: 'running',
    step: 'resolving-model',
    message: 'Resolving the model for regeneration',
  });

  const aiCall = createServerAiCall();
  const previewScenes: Scene[] = [];

  for (const [index, scene] of targetScenes.entries()) {
    const current = index + 1;
    await updateClassroomRegenerationJob(jobId, {
      status: 'running',
      step: 'generating-scene',
      message: `Generating regenerated content ${current}/${targetScenes.length}: ${scene.title}`,
    });
    log.info(
      `Regenerating scene ${current}/${targetScenes.length} for classroom ${job.classroomId}: ${scene.id} (${scene.title})`,
    );

    const previewScene = await regenerateScenePreview({
      stage: classroom.stage,
      scene,
      prompt: job.prompt,
      regenerateMode: job.regenerateMode,
      scopeId: job.scopeId,
      knowledgeBaseIds: job.knowledgeBaseIds,
      memoryIds: job.memoryIds,
      aiCall,
    });

    previewScenes.push(previewScene);
    await updateClassroomRegenerationJob(jobId, {
      status: 'running',
      step: 'assembling-preview',
      message: `Prepared regenerated preview ${current}/${targetScenes.length}`,
    });
  }

  const mediaOutlines = buildRegenerationMediaOutlines({
    originalScenes: targetScenes,
    previewScenes,
    prompt: job.prompt,
    language: classroom.stage.language,
  });
  if (mediaOutlines.length > 0) {
    await updateClassroomRegenerationJob(jobId, {
      status: 'running',
      step: 'generating-media',
      message: `Generating media assets for ${mediaOutlines.length} regenerated scene(s)`,
    });
    try {
      const mediaMap = await generateMediaForClassroom(
        mediaOutlines,
        job.classroomId,
        job.baseUrl || '',
      );
      replaceMediaPlaceholders(previewScenes, mediaMap);
      log.info(
        `Generated ${Object.keys(mediaMap).length} media asset(s) for regeneration job ${jobId}`,
      );
    } catch (error) {
      log.warn(`Media generation failed for regeneration job ${jobId}:`, error);
    }
  }

  await updateClassroomRegenerationJob(jobId, {
    status: 'running',
    step: 'generating-tts',
    message: 'Generating speech audio for regenerated scenes',
  });
  try {
    await generateTTSForClassroom(previewScenes, job.classroomId, job.baseUrl || '');
  } catch (error) {
    log.warn(`TTS generation failed for regeneration job ${jobId}:`, error);
  }

  await updateClassroomRegenerationJob(jobId, {
    status: 'preview-ready',
    step: 'preview-ready',
    message: 'Regeneration preview ready',
    preview: {
      stage: {
        lastRegeneratedAt: new Date().toISOString(),
      },
      scenes: previewScenes,
      changedSceneIds: previewScenes.map((scene) => scene.id),
    },
  });
}

export async function applyClassroomRegeneration(params: {
  classroomId: string;
  jobId: string;
  createRevision: boolean;
  baseUrl: string;
}) {
  const job = await readClassroomRegenerationJob(params.jobId);
  if (!job || job.classroomId !== params.classroomId) {
    throw new ServiceError(
      API_ERROR_CODES.REGENERATION_JOB_NOT_FOUND,
      404,
      'Regeneration job not found',
    );
  }
  if (job.status !== 'preview-ready' || !job.preview?.scenes?.length) {
    throw new ServiceError(
      API_ERROR_CODES.REGENERATION_PREVIEW_NOT_READY,
      409,
      'Regeneration preview is not ready',
    );
  }

  const classroom = await readClassroom(params.classroomId);
  if (!classroom) {
    throw new ServiceError(API_ERROR_CODES.CLASSROOM_NOT_FOUND, 404, 'Classroom not found');
  }

  if (params.createRevision) {
    await createClassroomRevision({
      classroomId: params.classroomId,
      source: 'pre-regenerate',
      summary: `Before applying regeneration job ${params.jobId}`,
      stage: classroom.stage,
      scenes: classroom.scenes,
    });
  }

  const previewById = new Map(job.preview.scenes.map((scene) => [scene.id, scene]));
  const scenes = classroom.scenes.map((scene) => previewById.get(scene.id) || scene);
  const nextStage: Stage = {
    ...classroom.stage,
    ...(job.preview.stage || {}),
    id: params.classroomId,
    updatedAt: Date.now(),
    lastRegeneratedAt: new Date().toISOString(),
  };
  const appliedRevision = await createClassroomRevision({
    classroomId: params.classroomId,
    source: 'system',
    summary: `Applied regeneration job ${params.jobId}`,
    stage: nextStage,
    scenes,
  });
  const stage: Stage = {
    ...nextStage,
    revisionId: appliedRevision.id,
  };

  await persistClassroom(
    {
      id: params.classroomId,
      stage,
      scenes,
    },
    params.baseUrl,
    { createdAt: classroom.createdAt },
  );

  await updateClassroomRegenerationJob(params.jobId, {
    status: 'applied',
    step: 'applied',
    message: 'Regeneration preview applied',
    result: {
      applied: true,
      classroomId: params.classroomId,
    },
  });

  return {
    classroomId: params.classroomId,
    jobId: params.jobId,
    applied: true as const,
  };
}

export async function discardClassroomRegeneration(params: {
  classroomId: string;
  jobId: string;
}) {
  const job = await readClassroomRegenerationJob(params.jobId);
  if (!job || job.classroomId !== params.classroomId) {
    throw new ServiceError(
      API_ERROR_CODES.REGENERATION_JOB_NOT_FOUND,
      404,
      'Regeneration job not found',
    );
  }

  await updateClassroomRegenerationJob(params.jobId, {
    status: 'discarded',
    step: 'discarded',
    message: 'Regeneration preview discarded',
  });

  log.info(`Discarded regeneration preview ${params.jobId} for classroom ${params.classroomId}`);

  return {
    jobId: params.jobId,
    discarded: true as const,
  };
}


