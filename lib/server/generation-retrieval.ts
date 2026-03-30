import { getDatabaseClient, isFullTextSearchEnabled } from '@/lib/server/db/client';
import { normalizeScopeId } from '@/lib/constants/scope';
import { getKnowledgeBaseService } from '@/lib/server/kb/service';
import { getMemoryService } from '@/lib/server/memory/service';
import { buildKnowledgeMediaReference, type KnowledgeVideoReference } from '@/lib/kb/reference';
import {
  blendSearchScore,
  buildFtsMatchExpression,
  buildLikePattern,
  computeKeywordMatchScore,
  normalizeFtsRank,
} from '@/lib/server/search/search-utils';
import { rerankHybridCandidates } from '@/lib/server/search/hybrid-ranker';

type RetrievedContextItem =
  | {
      sourceType: 'knowledge_chunk';
      score: number;
      label: string;
      content: string;
      metadata: string[];
    }
  | {
      sourceType: 'knowledge_video';
      score: number;
      label: string;
      content: string;
      metadata: string[];
    }
  | {
      sourceType: 'memory';
      score: number;
      label: string;
      content: string;
      metadata: string[];
    };

function normalizeRetrievedContextScore(item: RetrievedContextItem): number {
  const sourceBonus =
    item.sourceType === 'knowledge_chunk'
      ? 0.04
      : item.sourceType === 'memory'
        ? 0.03
        : 0.01;

  return Math.min(1, item.score + sourceBonus);
}

function dedupeRetrievedContext(items: RetrievedContextItem[]): RetrievedContextItem[] {
  const seen = new Set<string>();
  const result: RetrievedContextItem[] = [];

  for (const item of items) {
    const key = `${item.sourceType}:${item.label}:${item.content}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function rerankRetrievedContext(items: RetrievedContextItem[], topK: number): RetrievedContextItem[] {
  const perSourceLimit = Math.max(2, Math.ceil(topK / 2));
  const sourceCounts = new Map<RetrievedContextItem['sourceType'], number>();

  return dedupeRetrievedContext(items)
    .sort((a, b) => normalizeRetrievedContextScore(b) - normalizeRetrievedContextScore(a))
    .filter((item) => {
      const count = sourceCounts.get(item.sourceType) ?? 0;
      if (count >= perSourceLimit) return false;
      sourceCounts.set(item.sourceType, count + 1);
      return true;
    })
    .slice(0, topK);
}

function formatRetrievedContext(items: RetrievedContextItem[]): string {
  if (items.length === 0) return '';

  const lines = items.map((item, index) => {
    const details = [`score=${normalizeRetrievedContextScore(item).toFixed(2)}`, ...item.metadata];
    return `${index + 1}. [${item.label}] ${item.content} (${details.join(', ')})`;
  });

  return `## Unified Retrieval Context\n${lines.join('\n')}`;
}

async function searchSelectedMemories(input: {
  query: string;
  scopeId: string;
  memoryIds: string[];
  topK: number;
}): Promise<Array<{ id: string; content: string; category: string; score: number }>> {
  if (input.memoryIds.length === 0) return [];

  const db = await getDatabaseClient();
  const placeholders = input.memoryIds.map(() => '?').join(', ');
  const items = new Map<
    string,
    { id: string; content: string; category: string; score: number; isPinned: boolean; updatedAt: number }
  >();
  const targetSize = Math.min(Math.max(input.topK * 4, input.topK), 40);
  const ftsMatch = buildFtsMatchExpression(input.query);

  if (isFullTextSearchEnabled() && ftsMatch) {
    const rows = db
      .prepare(
        `SELECT mn.*, bm25(memory_notes_fts, 1.0, 0.7, 0.5) AS fts_rank
         FROM memory_notes_fts
         JOIN memory_notes mn ON mn.id = memory_notes_fts.note_id
         WHERE memory_notes_fts MATCH ?
           AND mn.scope_id = ?
           AND mn.id IN (${placeholders})
         ORDER BY mn.is_pinned DESC, fts_rank ASC, mn.updated_at DESC
         LIMIT ?`,
      )
      .all(ftsMatch, input.scopeId, ...input.memoryIds, targetSize);

    for (const row of rows) {
      const content = String(row.content);
      const keywordScore = computeKeywordMatchScore(
        input.query,
        `${content} ${String(row.keywords_json || '[]')} ${String(row.tags_json || '[]')}`,
      );
      const score = blendSearchScore(normalizeFtsRank(row.fts_rank), keywordScore, {
        bonus: Number(row.is_pinned || 0) === 1 ? 0.05 : 0,
      });
      if (score <= 0) continue;
      items.set(String(row.id), {
        id: String(row.id),
        content,
        category: String(row.category),
        score,
        isPinned: Number(row.is_pinned || 0) === 1,
        updatedAt: Number(row.updated_at || 0),
      });
    }
  }

  if (items.size < input.topK) {
    const likePattern = buildLikePattern(input.query);
    const rows = db
      .prepare(
        `SELECT * FROM memory_notes
         WHERE scope_id = ?
           AND id IN (${placeholders})
           AND (content LIKE ? ESCAPE '!' OR keywords_json LIKE ? ESCAPE '!' OR tags_json LIKE ? ESCAPE '!')
         ORDER BY is_pinned DESC, updated_at DESC
         LIMIT ?`,
      )
      .all(input.scopeId, ...input.memoryIds, likePattern, likePattern, likePattern, targetSize);

    for (const row of rows) {
      const content = String(row.content);
      const score = blendSearchScore(
        0,
        computeKeywordMatchScore(
          input.query,
          `${content} ${String(row.keywords_json || '[]')} ${String(row.tags_json || '[]')}`,
        ),
        {
          ftsWeight: 0,
          keywordWeight: 1,
          bonus: Number(row.is_pinned || 0) === 1 ? 0.05 : 0,
        },
      );
      if (score <= 0) continue;
      items.set(String(row.id), {
        id: String(row.id),
        content,
        category: String(row.category),
        score,
        isPinned: Number(row.is_pinned || 0) === 1,
        updatedAt: Number(row.updated_at || 0),
      });
    }
  }

  const reranked = await rerankHybridCandidates({
    query: input.query,
    candidates: Array.from(items.values()).map((item) => ({
      item,
      text: `${item.content} ${item.category}`,
      baseScore: item.score,
      bonus: item.isPinned ? 0.03 : 0,
    })),
  });

  return reranked
    .sort((a, b) => b.score - a.score || Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt)
    .slice(0, input.topK)
    .map(({ id, content, category, score }) => ({ id, content, category, score }));
}

function convertKnowledgeResultsToRetrievedItems(
  result: Awaited<ReturnType<ReturnType<typeof getKnowledgeBaseService>['searchKnowledgeBase']>>,
): RetrievedContextItem[] {
  return result.items.map((item) => {
    if (item.type === 'video') {
      const metadata: string[] = [`fileId=${item.fileId}`];
      if (item.durationMs != null) metadata.push(`duration=${Math.round(item.durationMs / 1000)}s`);
      if (item.width != null && item.height != null) {
        metadata.push(`resolution=${item.width}x${item.height}`);
      }
      return {
        sourceType: 'knowledge_video' as const,
        score: item.score,
        label: 'Knowledge Video',
        content: item.filename,
        metadata,
      };
    }

    return {
      sourceType: 'knowledge_chunk' as const,
      score: item.score,
      label: 'Knowledge Text',
      content: item.text,
      metadata: [`fileId=${item.fileId}`],
    };
  });
}

function convertMemoryResultsToRetrievedItems(
  items: Array<{ content: string; category: string; score: number }>,
): RetrievedContextItem[] {
  return items.map((item) => ({
    sourceType: 'memory' as const,
    score: item.score,
    label: `Memory:${item.category}`,
    content: item.content,
    metadata: [],
  }));
}

export async function buildGenerationRetrievalContext(input: {
  query: string;
  scopeId?: string;
  knowledgeBaseIds?: string[];
  memoryIds?: string[];
  enableKnowledgeRetrieval?: boolean;
  enableMemoryRetrieval?: boolean;
  preferKnowledgeVideos?: boolean;
}): Promise<string | undefined> {
  const retrievedItems: RetrievedContextItem[] = [];
  const scopeId = normalizeScopeId(input.scopeId);

  if (input.enableKnowledgeRetrieval && input.knowledgeBaseIds && input.knowledgeBaseIds.length > 0) {
    const knowledgeResult = await getKnowledgeBaseService().searchKnowledgeBase({
      query: input.query,
      knowledgeBaseIds: input.knowledgeBaseIds,
      topK: 5,
      includeVideos: input.preferKnowledgeVideos ?? true,
      includeDocuments: true,
    });
    retrievedItems.push(...convertKnowledgeResultsToRetrievedItems(knowledgeResult));
  }

  if (input.memoryIds && input.memoryIds.length > 0) {
    const items = await searchSelectedMemories({
      query: input.query,
      scopeId,
      memoryIds: input.memoryIds,
      topK: 5,
    });
    retrievedItems.push(...convertMemoryResultsToRetrievedItems(items));
  } else if (input.enableMemoryRetrieval) {
    const memoryResult = await getMemoryService().searchMemory({
      scopeId,
      query: input.query,
      categories: [],
      topK: 5,
    });
    retrievedItems.push(...convertMemoryResultsToRetrievedItems(memoryResult.items));
  }

  const reranked = rerankRetrievedContext(retrievedItems, 6);
  return reranked.length > 0 ? formatRetrievedContext(reranked) : undefined;
}

export async function getKnowledgeVideoReferencesForGeneration(input: {
  query: string;
  knowledgeBaseIds?: string[];
  preferKnowledgeVideos?: boolean;
}): Promise<KnowledgeVideoReference[]> {
  if (!input.knowledgeBaseIds || input.knowledgeBaseIds.length === 0) return [];

  const result = await getKnowledgeBaseService().searchKnowledgeBase({
    query: input.query,
    knowledgeBaseIds: input.knowledgeBaseIds,
    topK: 5,
    includeVideos: input.preferKnowledgeVideos ?? true,
    includeDocuments: false,
  });

  return result.items
    .filter((item): item is Extract<(typeof result.items)[number], { type: 'video' }> => item.type === 'video')
    .map((item) => ({
      fileId: item.fileId,
      filename: item.filename,
      src: buildKnowledgeMediaReference(item.fileId),
      ...(item.posterUrl ? { poster: item.posterUrl } : {}),
      ...(item.durationMs != null ? { durationMs: item.durationMs } : {}),
      ...(item.width != null ? { width: item.width } : {}),
      ...(item.height != null ? { height: item.height } : {}),
      ...(item.score != null ? { score: item.score } : {}),
    }));
}
