import {
  isKnowledgeMediaReference,
  parseKnowledgeMediaFileId,
  resolveKnowledgeMediaPoster,
  resolveKnowledgeMediaSrc,
} from '@/lib/kb/reference';
import {
  getGenerationContextKnowledgeBaseCount,
  getGenerationContextMemoryCount,
} from '@/lib/context/generation-context';
import type {
  PPTAudioElement,
  PPTElement,
  PPTImageElement,
  PPTVideoElement,
} from '@/lib/types/slides';
import type { Scene, Stage } from '@/lib/types/stage';

export function buildGenerationContextText(stage: Stage | null): string {
  const context = stage?.generationContext;
  if (!context) return '';

  const parts: string[] = [];
  const knowledgeBaseNames = context.selectedKnowledgeBases?.map((item) => item.name) ?? [];
  const memorySummaries =
    context.selectedMemories?.map((item) => `${item.category}: ${item.contentPreview}`) ?? [];
  const knowledgeBaseCount = getGenerationContextKnowledgeBaseCount(context);
  const memoryCount = getGenerationContextMemoryCount(context);

  if (knowledgeBaseCount > 0) {
    parts.push(`Knowledge bases: ${knowledgeBaseCount}`);
  }
  if (knowledgeBaseNames.length > 0) {
    parts.push(`Knowledge base names: ${knowledgeBaseNames.join(', ')}`);
  }
  if (memoryCount > 0) {
    parts.push(`Memory notes: ${memoryCount}`);
  }
  if (memorySummaries.length > 0) {
    parts.push(`Memory summaries: ${memorySummaries.join(' | ')}`);
  }
  if (context.preferKnowledgeVideos) {
    parts.push('Prefer knowledge videos: enabled');
  }

  return parts.join('\n');
}

export function buildPresentationSubject(stage: Stage | null): string {
  const context = stage?.generationContext;
  const knowledgeBaseCount = getGenerationContextKnowledgeBaseCount(context);
  const memoryCount = getGenerationContextMemoryCount(context);
  const suffix: string[] = [];

  if (knowledgeBaseCount > 0) suffix.push(`${knowledgeBaseCount} knowledge base`);
  if (memoryCount > 0) suffix.push(`${memoryCount} memory note`);
  if (context?.preferKnowledgeVideos) suffix.push('prefer videos');

  return suffix.length > 0
    ? `OpenMAIC classroom export (${suffix.join(', ')})`
    : 'OpenMAIC classroom export';
}

function extractKnowledgeAssetFromElement(element: PPTElement) {
  if (!('src' in element) || typeof element.src !== 'string') return null;
  if (!isKnowledgeMediaReference(element.src)) return null;

  const fileId = parseKnowledgeMediaFileId(element.src);
  if (!fileId) return null;

  const base = {
    elementId: element.id,
    fileId,
    reference: element.src,
    resolvedSrc: resolveKnowledgeMediaSrc(element.src),
  };

  if (element.type === 'video') {
    const video = element as PPTVideoElement;
    return {
      ...base,
      kind: 'video' as const,
      poster: resolveKnowledgeMediaPoster(video.src, video.poster),
      autoplay: video.autoplay,
    };
  }

  if (element.type === 'image') {
    const image = element as PPTImageElement;
    return {
      ...base,
      kind: 'image' as const,
      fixedRatio: image.fixedRatio,
    };
  }

  if (element.type === 'audio') {
    const audio = element as PPTAudioElement;
    return {
      ...base,
      kind: 'audio' as const,
      autoplay: audio.autoplay,
      loop: audio.loop,
    };
  }

  return {
    ...base,
    kind: 'unknown' as const,
  };
}

export function extractSceneKnowledgeAssets(scene: Scene) {
  if (scene.content.type !== 'slide') return [];
  return scene.content.canvas.elements
    .map((element) => extractKnowledgeAssetFromElement(element))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function buildGenerationContextExport(stage: Stage | null, scenes: Scene[]) {
  const context = stage?.generationContext;
  const slideScenes = scenes.filter((scene) => scene.content.type === 'slide');
  const interactiveScenes = scenes.filter((scene) => scene.content.type === 'interactive');

  return {
    exportedAt: new Date().toISOString(),
    stage: stage
      ? {
          id: stage.id,
          name: stage.name,
          description: stage.description,
          language: stage.language,
          style: stage.style,
          createdAt: stage.createdAt,
          updatedAt: stage.updatedAt,
        }
      : null,
    summary: {
      totalScenes: scenes.length,
      slideScenes: slideScenes.length,
      interactiveScenes: interactiveScenes.length,
      knowledgeBaseCount: getGenerationContextKnowledgeBaseCount(context),
      memoryCount: getGenerationContextMemoryCount(context),
      preferKnowledgeVideos: context?.preferKnowledgeVideos ?? false,
    },
    generationContext: context
      ? {
          scopeId: context.scopeId ?? null,
          knowledgeBaseIds: context.knowledgeBaseIds ?? [],
          memoryIds: context.memoryIds ?? [],
          selectedKnowledgeBases: context.selectedKnowledgeBases ?? [],
          selectedMemories: context.selectedMemories ?? [],
          enableKnowledgeRetrieval: context.enableKnowledgeRetrieval ?? false,
          enableMemoryRetrieval: context.enableMemoryRetrieval ?? false,
          preferKnowledgeVideos: context.preferKnowledgeVideos ?? false,
        }
      : null,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      type: scene.type,
      order: scene.order,
      generationContext: scene.generationContext
        ? {
            retrievalContext: scene.generationContext.retrievalContext ?? '',
            knowledgeVideoReferences: scene.generationContext.knowledgeVideoReferences ?? [],
          }
        : null,
      knowledgeAssets: extractSceneKnowledgeAssets(scene),
    })),
  };
}
