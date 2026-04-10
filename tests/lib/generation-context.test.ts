import { describe, expect, it } from 'vitest';
import {
  isGenerationContextSummaryEqual,
  mergeGenerationContextSummary,
} from '@/lib/context/generation-context';

describe('generation context helpers', () => {
  it('treats equivalent summaries as equal even when references differ', () => {
    expect(
      isGenerationContextSummaryEqual(
        {
          classroomType: 'course',
          scopeId: 'scope-default',
          knowledgeBaseIds: ['kb-1'],
          memoryIds: ['mem-1'],
          selectedKnowledgeBases: ['Physics'],
          selectedMemories: ['Teacher Notes'],
          enableKnowledgeRetrieval: true,
          enableMemoryRetrieval: false,
          preferKnowledgeVideos: false,
        },
        {
          classroomType: 'course',
          scopeId: 'scope-default',
          knowledgeBaseIds: ['kb-1'],
          memoryIds: ['mem-1'],
          selectedKnowledgeBases: ['Physics'],
          selectedMemories: ['Teacher Notes'],
          enableKnowledgeRetrieval: true,
          enableMemoryRetrieval: false,
          preferKnowledgeVideos: false,
        },
      ),
    ).toBe(true);
  });

  it('detects classroom type changes', () => {
    expect(
      isGenerationContextSummaryEqual(
        {
          classroomType: 'course',
        },
        {
          classroomType: 'ppt',
        },
      ),
    ).toBe(false);
  });

  it('preserves classroomType when merging session and stage context', () => {
    expect(
      mergeGenerationContextSummary(
        {
          classroomType: 'course',
        },
        {
          classroomType: 'ppt',
        },
      ),
    ).toEqual({
      classroomType: 'course',
      scopeId: undefined,
      knowledgeBaseIds: undefined,
      memoryIds: undefined,
      selectedKnowledgeBases: undefined,
      selectedMemories: undefined,
      enableKnowledgeRetrieval: undefined,
      enableMemoryRetrieval: undefined,
      preferKnowledgeVideos: undefined,
    });
  });
});
