import type { GenerationLinkType } from './common';

export const GENERATION_TABLES = {
  generationContextLinks: 'generation_context_links',
} as const;

export interface GenerationContextLinkRow {
  id: string;
  stageId: string;
  sceneId: string | null;
  knowledgeBaseId: string | null;
  knowledgeFileId: string | null;
  knowledgeChunkId: string | null;
  memoryNoteId: string | null;
  linkType: GenerationLinkType;
  score: number | null;
  createdAt: number;
}
