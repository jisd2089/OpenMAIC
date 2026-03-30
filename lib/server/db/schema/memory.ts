import type { MemoryCategory, MemorySourceType } from './common';

export const MEMORY_TABLES = {
  memoryNotes: 'memory_notes',
} as const;

export interface MemoryNoteRow {
  id: string;
  scopeId: string;
  content: string;
  category: MemoryCategory;
  keywordsJson: string;
  tagsJson: string;
  metadataJson: string;
  mimeType: string;
  sourceType: MemorySourceType;
  sourceRefId: string | null;
  isPinned: 0 | 1;
  vectorDocId: string | null;
  createdAt: number;
  updatedAt: number;
}
