import type { GenerationContextSummary } from '@/lib/types/stage';

function hasItems<T>(items?: T[] | null): items is T[] {
  return Array.isArray(items) && items.length > 0;
}

function preferNonEmptyArray<T>(primary?: T[], fallback?: T[]): T[] | undefined {
  if (hasItems(primary)) return primary;
  if (hasItems(fallback)) return fallback;
  return primary ?? fallback;
}

function preferNonBlankString(primary?: string, fallback?: string): string | undefined {
  const normalizedPrimary = primary?.trim();
  if (normalizedPrimary) return normalizedPrimary;

  const normalizedFallback = fallback?.trim();
  if (normalizedFallback) return normalizedFallback;

  return normalizedPrimary ?? normalizedFallback;
}

export function getGenerationContextKnowledgeBaseCount(
  context?: GenerationContextSummary | null,
): number {
  if (!context) return 0;
  return context.selectedKnowledgeBases?.length || context.knowledgeBaseIds?.length || 0;
}

export function getGenerationContextMemoryCount(context?: GenerationContextSummary | null): number {
  if (!context) return 0;
  return context.selectedMemories?.length || context.memoryIds?.length || 0;
}

export function hasGenerationContextSummary(
  context?: GenerationContextSummary | null,
): boolean {
  if (!context) return false;
  return (
    getGenerationContextKnowledgeBaseCount(context) > 0 ||
    getGenerationContextMemoryCount(context) > 0
  );
}

export function mergeGenerationContextSummary(
  primary?: GenerationContextSummary | null,
  fallback?: GenerationContextSummary | null,
): GenerationContextSummary | null {
  if (!primary && !fallback) return null;

  return {
    scopeId: preferNonBlankString(primary?.scopeId, fallback?.scopeId),
    knowledgeBaseIds: preferNonEmptyArray(primary?.knowledgeBaseIds, fallback?.knowledgeBaseIds),
    memoryIds: preferNonEmptyArray(primary?.memoryIds, fallback?.memoryIds),
    selectedKnowledgeBases: preferNonEmptyArray(
      primary?.selectedKnowledgeBases,
      fallback?.selectedKnowledgeBases,
    ),
    selectedMemories: preferNonEmptyArray(primary?.selectedMemories, fallback?.selectedMemories),
    enableKnowledgeRetrieval:
      primary?.enableKnowledgeRetrieval ?? fallback?.enableKnowledgeRetrieval,
    enableMemoryRetrieval: primary?.enableMemoryRetrieval ?? fallback?.enableMemoryRetrieval,
    preferKnowledgeVideos: primary?.preferKnowledgeVideos ?? fallback?.preferKnowledgeVideos,
  };
}
